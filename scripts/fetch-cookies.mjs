#!/usr/bin/env node
/**
 * Fetches the cookies needed to reach a SuperOffice tenant from outside it, and writes them to a
 * gitignored env file (never commit real session cookies).
 *
 * Run directly it serves development: it logs in to the dev target and writes VITE_DEV_COOKIES
 * to .env.development.local. A freshly scaffolded app gets a "predev" script that runs this
 * automatically before "npm run dev"; an app that adopted deployment tooling later may have
 * skipped that (see docs/adopt-deployment.md) and rely on "npm run dev:cookies" instead:
 * 1. Reads whatever cookies are already saved in .env.development.local (if any).
 * 2. Verifies them with a real, tiny request to the SuperOffice REST API and another to CRMScript -
 *    no browser involved.
 * 3. Only if that fails (missing, or SuperOffice rejects them) does it open a real browser
 *    window for you to log in, then verifies the freshly-obtained cookies the same way.
 *
 * Imported, fetchCookies() does the same for any target. Every target gets its own env variable
 * and its own browser profile, so holding a session on one tenant never signs you out of another.
 * resolveTenantUrl(), REST_COOKIES and formatCookieHeader() are exported alongside it, so the deploy
 * client reaches the tenant on the same host, with the same pair of cookies, as the REST probe here.
 *
 * Note: ASP.NET_SessionId is a session cookie (no expiry), so Chromium drops it the moment
 * the browser process closes - it can never survive being read back from a browser profile on
 * a later run. That's why step 2 checks the last known value directly against the server
 * instead of asking a browser to remember it.
 *
 * Run it manually any time with: npm run dev:cookies
 *
 * Plain .mjs, not TypeScript: node runs .ts unflagged only from 22.18, and this has to work in
 * older projects on older node.
 */
import puppeteer from "puppeteer";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { DEV_URL_MODULE_FILE, readDevUrl } from "./deploy-config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Cookies required to reach SuperOffice from outside it. The REST API and CRMScript
// authenticate on different pairs, and neither pair works for the other, so all four are
// fetched regardless of what the caller ends up calling.
//
//   XSRF-TOKEN         REST API. Sent as a cookie, and mirrored into the X-XSRF-TOKEN header
//   ASP.NET_SessionId  REST API session
//   key                CRMScript over blogic.fcgi
//   loginId            CRMScript over blogic.fcgi
const REQUIRED_COOKIES = ["XSRF-TOKEN", "ASP.NET_SessionId", "key", "loginId"];

// Each validity probe sends only its own pair. Sending all four would let a stale pair hide
// behind the other one still working, which is exactly what the probes exist to catch.
export const REST_COOKIES = ["XSRF-TOKEN", "ASP.NET_SessionId"];
const CRMSCRIPT_COOKIES = ["key", "loginId"];

// A cheap, always-present entity to probe with - just checking auth, not reading real data.
const REST_VALIDITY_CHECK_PATH = "api/v1/Contact?$top=1";

// An include id no tenant has, so nothing gets run - the point of a probe. Service only reaches
// the script lookup with a usable session; see verifyCrmScriptCookies for how the two outcomes
// are told apart.
const CRMSCRIPT_VALIDITY_CHECK_PATH = "CS/scripts/blogic.fcgi?action=doScript&includeId=fetch_cookies_probe";

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

// A tenant is one host move away from its vanity URL. Anything still redirecting after this many
// is a loop, not a tenant.
const MAX_REDIRECT_HOPS = 5;

const HEADED_TIMEOUT_MS = 5 * 60 * 1000; // Give time for a manual login.

// The placeholder tenant from the generator's own prompt default - never a real SuperOffice
// tenant, so logging in against it can never succeed. Catch it before opening a browser.
const PLACEHOLDER_CUST = "CustXXXXX";

/** True if every required cookie name has a non-empty value. Shared so saved/browser lookups can't drift apart. */
function hasAllRequiredCookies(cookies) {
  return REQUIRED_COOKIES.every(name => cookies[name]);
}

/** Formats the named cookies as a Cookie header value. */
export function formatCookieHeader(cookies, names) {
  return names.map(name => `${name}=${cookies[name]}`).join("; ");
}

/**
 * Matches the whole line that sets envKey, and only that line - a commented-out or indented copy
 * of the key is left alone, both when reading it back and when replacing it. The key is escaped
 * because it is caller-supplied and ends up inside a regular expression.
 */
function envKeyLine(envKey) {
  const escapedKey = envKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedKey}=(.*)$`, "m");
}

/** Parses the env variable out of the env file, if the file and all required cookies exist. */
function readSavedCookies(envFilePath, envKey) {
  if (!existsSync(envFilePath)) return null;

  const contents = readFileSync(envFilePath, "utf-8");
  const match = contents.match(envKeyLine(envKey));
  if (!match) return null;

  const cookies = Object.fromEntries(
    match[1]
      .trimEnd() // guards against a trailing \r if the file ever picks up CRLF line endings
      .split("; ")
      .filter(Boolean)
      .map(pair => {
        const separatorIndex = pair.indexOf("=");
        return [pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1)];
      })
  );

  return hasAllRequiredCookies(cookies) ? cookies : null;
}

/** Ensures a tenant URL ends with a slash, so paths resolved against it keep the CustXXXXX segment. */
function withTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

/** Sends a HEAD request without following redirects, naming the URL when SuperOffice cannot be reached. */
async function requestHead(url) {
  try {
    return await fetch(url, { method: "HEAD", redirect: "manual" });
  } catch (error) {
    throw new Error(`Could not reach ${url} to resolve the tenant host: ${error.message}`);
  }
}

/** The URL a response moves the request to when it is a plain host move keeping the tenant path, otherwise null. */
function hostRedirectTarget(response, currentUrl) {
  if (!REDIRECT_STATUSES.includes(response.status)) return null;

  const location = response.headers.get("location");
  if (!location) return null;

  // A redirect that leaves the tenant path is the login bounce an anonymous request gets, which
  // means this host already answers for the tenant.
  const next = new URL(location, currentUrl);
  if (next.pathname.replace(/\/$/, "") !== currentUrl.pathname.replace(/\/$/, "")) return null;

  return next;
}

/**
 * Follows a tenant URL through host redirects to the host that actually serves it. A vanity host
 * (sod.superoffice.com/CustXXXXX) answers a browser with a 307 to the app host
 * (app-sod.superoffice.com/CustXXXXX), but answers a direct API call with 421 instead - so every
 * request has to go to the resolved host, not the one that was typed in.
 */
export async function resolveTenantUrl(tenantUrl) {
  let current = new URL(withTrailingSlash(tenantUrl));
  let hopsTaken = 0;

  // One request more than the hop budget, so the host the last allowed hop lands on is probed
  // too instead of being written off as a loop.
  while (hopsTaken <= MAX_REDIRECT_HOPS) {
    const response = await requestHead(current);
    const next = hostRedirectTarget(response, current);

    if (!next) return withTrailingSlash(current.toString());
    current = next;
    hopsTaken++;
  }

  throw new Error(`${tenantUrl} kept redirecting after ${MAX_REDIRECT_HOPS} hops - could not settle on a host.`);
}

/**
 * A 421 Misdirected Request means this host does not serve the tenant. Fetching cookies again
 * cannot fix that, so it must never be read as an expired session - that would reopen the browser
 * on every run, forever.
 */
function throwOnWrongHost(response, url) {
  if (response.status !== 421) return;

  throw new Error(
    `${new URL(url).host} answered 421 Misdirected Request - it is not the host that serves this tenant, ` +
      "so logging in again would not help. Check the tenant URL against the one your browser lands on."
  );
}

/**
 * Sends one validity probe to a path under the tenant and returns the response for the caller to
 * judge, or null when SuperOffice could not be reached at all. A wrong host throws, so no probe
 * can mistake it for a rejection.
 */
async function sendProbe(path, tenantUrl, init) {
  const url = new URL(path, tenantUrl).toString();

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    console.log(`[fetch-cookies] Could not reach SuperOffice to verify cookies: ${error.message}`);
    return null;
  }

  throwOnWrongHost(response, url);
  return response;
}

/** Checks the REST pair with a tiny real request to the SuperOffice REST API. */
async function verifyRestCookies(cookies, tenantUrl) {
  const response = await sendProbe(REST_VALIDITY_CHECK_PATH, tenantUrl, {
    headers: {
      Cookie: formatCookieHeader(cookies, REST_COOKIES),
      "X-XSRF-TOKEN": cookies["XSRF-TOKEN"],
      Accept: "application/json",
      PartnerOrigin: "Cloud Connection"
    }
  });
  if (!response) return false;

  // A dead session/dead cookie is usually redirected to an HTML login page rather than a
  // clean 401 - so also make sure we actually got JSON back, not a login page.
  return response.ok && (response.headers.get("content-type") ?? "").includes("json");
}

/**
 * Checks the CRMScript pair against blogic.fcgi. Service never answers a dead pair with a 401: on
 * the resolved host it answers 302 to the tenant's /login/ page and clears key and loginId on the
 * way (checked against the SOD app host, both with no cookies and with a made-up pair). Followed,
 * that redirect ends on the SuperID page as HTML with HTTP 200 - which is what the spike saw and
 * why a stale pair used to pass. So the redirect is left unfollowed and is itself the rejection.
 */
async function verifyCrmScriptCookies(cookies, tenantUrl) {
  const response = await sendProbe(CRMSCRIPT_VALIDITY_CHECK_PATH, tenantUrl, {
    redirect: "manual",
    headers: {
      Cookie: formatCookieHeader(cookies, CRMSCRIPT_COOKIES),
      PartnerOrigin: "Cloud Connection"
    }
  });
  if (!response) return false;

  // Judged on the status alone, on purpose. With a live session Service renders the probe's
  // unknown include id as an HTML error page, also with HTTP 200 (seen in the spike), so
  // rejecting an HTML body would reject every live session and reopen the browser on every run.
  return response.ok;
}

/**
 * Checks whether these cookies still work. Both authentication paths are exercised, because
 * either pair can expire without the other showing it - and a stale pair that slips through here
 * only fails later, at the call site, where nothing can log in again.
 */
async function verifyCookies(cookies, tenantUrl) {
  const restWorks = await verifyRestCookies(cookies, tenantUrl);
  if (!restWorks) return false;

  return verifyCrmScriptCookies(cookies, tenantUrl);
}

/** Reads the required cookies the browser holds for the URL, or null until every one of them is set. */
async function readRequiredCookiesFromBrowser(page, url) {
  const cookies = await page.cookies(url);
  const found = Object.fromEntries(
    REQUIRED_COOKIES.map(name => [name, cookies.find(cookie => cookie.name === name)?.value]).filter(
      ([, value]) => value
    )
  );

  return hasAllRequiredCookies(found) ? found : null;
}

/** Opens a real (headed) browser window on the SuperOffice URL and waits for you to log in. */
async function loginAndFetchCookies(url, profileDir) {
  const browser = await puppeteer.launch({
    headless: false,
    // On some machines (seen on Windows, likely corporate VPN/security software) node.exe can't
    // reach 127.0.0.1 - Puppeteer's default WebSocket transport to Chrome then hangs silently.
    // A direct pipe sidesteps loopback networking entirely.
    pipe: true,
    userDataDir: profileDir,
    args: ["--window-size=1024,800"]
  });

  // A prior run left orphaned (see the signal handling below) makes Chrome treat this launch as
  // crash recovery and restore every leftover tab - one more each time it happens. Trimming back
  // to one tab here means that self-heals instead of compounding.
  const pages = await browser.pages();
  await Promise.all(pages.slice(1).map(page => page.close()));
  const [page] = pages;

  // Ctrl+C during a pending login must close the browser, not orphan the process - orphaning is
  // exactly what causes the tab accumulation above.
  const closeOnSignal = () => browser.close().finally(() => process.exit(1));
  process.on("SIGINT", closeOnSignal);
  process.on("SIGTERM", closeOnSignal);

  try {
    // Reuse the browser's already-open default tab instead of browser.newPage() - a fresh tab
    // isn't guaranteed to get OS focus, which can leave you staring at the original about:blank
    // tab while the real login page loads unseen in the new one, with nothing to log in to.
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.bringToFront();

    // Windows (only) blocks a background process from stealing OS focus outright, so
    // bringToFront() alone can leave the login window open but unfocused behind whatever else is
    // on screen there. Minimizing then restoring forces the OS to hand it real focus. Elsewhere
    // bringToFront() is already enough, and this would just be a visible, pointless flicker.
    if (process.platform === "win32") {
      const cdp = await page.createCDPSession();
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    }

    const deadline = Date.now() + HEADED_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const found = await readRequiredCookiesFromBrowser(page, url);
      if (found) return found;
      await new Promise(done => setTimeout(done, 1000));
    }

    return null;
  } finally {
    process.off("SIGINT", closeOnSignal);
    process.off("SIGTERM", closeOnSignal);
    await browser.close();
  }
}

/** Writes the cookies to the env file under envKey, creating the file or replacing just that line. */
function writeEnvFile(envFilePath, envKey, cookies) {
  const line = `${envKey}=${formatCookieHeader(cookies, REQUIRED_COOKIES)}`;

  if (!existsSync(envFilePath)) {
    const header = "# Auto-generated by scripts/fetch-cookies.mjs - do not edit by hand, do not commit.\n";
    writeFileSync(envFilePath, `${header}${line}\n`, "utf-8");
    return;
  }

  // The same pattern decides whether the line exists and replaces it, so the two can never
  // disagree - if they did, a fresh session would be dropped while the run still reported success.
  const contents = readFileSync(envFilePath, "utf-8");
  const keyLine = envKeyLine(envKey);
  // The replacement is a function so that a "$" in a cookie value is written as-is - given as a
  // string, replace() would expand it as a pattern reference and corrupt the line.
  const updated = keyLine.test(contents)
    ? contents.replace(keyLine, () => line)
    : `${contents}${contents.endsWith("\n") ? "" : "\n"}${line}\n`;

  writeFileSync(envFilePath, updated, "utf-8");
}

/**
 * Makes sure a working session for one target is stored under envKey in envFilePath, and returns
 * its cookies. Saved cookies are verified first; a browser login (kept in profileDir, one per
 * target) is only opened when they are missing or rejected. wrongTenantHint, if given, is printed
 * alongside the browser URL to say where the tenant URL can be corrected.
 */
export async function fetchCookies(options) {
  const { tenantUrl, envKey, profileDir, envFilePath, wrongTenantHint = "" } = options;

  if (!tenantUrl) throw new Error("fetchCookies needs a tenantUrl");
  if (!envKey) throw new Error("fetchCookies needs an envKey");
  if (!profileDir) throw new Error("fetchCookies needs a profileDir");
  if (!envFilePath) throw new Error("fetchCookies needs an envFilePath");

  const envFileName = basename(envFilePath);
  const resolvedUrl = await resolveTenantUrl(tenantUrl);

  console.log(`[fetch-cookies] 🦉 Checking for saved SuperOffice cookies in ${envFileName}...`);
  const savedCookies = readSavedCookies(envFilePath, envKey);

  if (!savedCookies) {
    console.log("[fetch-cookies] No saved cookies found.");
  } else {
    console.log("[fetch-cookies] 🍪 Found saved cookies - verifying against SuperOffice...");
    const stillValid = await verifyCookies(savedCookies, resolvedUrl);

    if (stillValid) {
      console.log("[fetch-cookies] ✅ SuperOffice cookies are valid");
      return savedCookies;
    }

    console.log("[fetch-cookies] Saved cookies were rejected (session expired).");
  }

  console.log(`[fetch-cookies] 🌐 Opening a browser window for: ${resolvedUrl}`);
  if (wrongTenantHint) console.log(`[fetch-cookies] Wrong tenant? ${wrongTenantHint}`);
  const cookies = await loginAndFetchCookies(resolvedUrl, profileDir);

  if (!cookies) {
    throw new Error(`Timed out waiting for cookies: ${REQUIRED_COOKIES.join(", ")}.`);
  }

  // Sanity-check the freshly-obtained cookies the same way saved ones are checked - a login can
  // succeed while still leaving the app 401ing, if REQUIRED_COOKIES is ever missing a cookie
  // this particular tenant actually needs.
  const freshCookiesWork = await verifyCookies(cookies, resolvedUrl);
  if (!freshCookiesWork) {
    console.log(
      `[fetch-cookies] ⚠️ Logged in, but SuperOffice still rejected ${REQUIRED_COOKIES.join(", ")}. ` +
        "This tenant may need an additional cookie - check REQUIRED_COOKIES in this script."
    );
  }

  writeEnvFile(envFilePath, envKey, cookies);
  console.log(`[fetch-cookies] 🍪 Done - wrote ${REQUIRED_COOKIES.join(", ")} to ${envFileName}`);

  return cookies;
}

/** Fetches cookies for the dev target - what "npm run dev" and "npm run dev:cookies" run. */
async function main() {
  // superoffice-url.ts is generated from the dev target in deploy.config.json, and "npm run deploy"
  // regenerates it - so a missing or placeholder URL is fixed in the config, never in the module.
  const superOfficeUrl = readDevUrl();
  if (!superOfficeUrl) {
    throw new Error(
      `Could not find DEV_SUPEROFFICE_URL in ${DEV_URL_MODULE_FILE} - set the dev target in deploy.config.json; ` +
        '"npm run deploy" regenerates this file from it.'
    );
  }

  if (superOfficeUrl.includes(PLACEHOLDER_CUST)) {
    throw new Error(
      `${superOfficeUrl} is still the generator's placeholder tenant - add your real SuperOffice URL as the ` +
        'dev target in deploy.config.json; "npm run deploy" regenerates this file from it.'
    );
  }

  await fetchCookies({
    tenantUrl: superOfficeUrl,
    envKey: "VITE_DEV_COOKIES",
    envFilePath: join(projectRoot, ".env.development.local"),
    // One browser profile per target inside the directory that is already gitignored, so a
    // login on another target never replaces the dev one.
    profileDir: join(projectRoot, ".dev-cookies-profile", "dev"),
    wrongTenantHint: "Change the dev target's url in deploy.config.json"
  });
}

// Only the direct run is the dev run - importing the module for another target must not start it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[fetch-cookies] ${error.message}`);
    process.exit(1);
  });
}
