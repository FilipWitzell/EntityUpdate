#!/usr/bin/env node
/**
 * Deploys the built app to a SuperOffice target as blobs - "npm run deploy".
 *
 * In order: checks the config against the project, builds the app, logs in to the target, looks
 * every file up by Conceptual type, backs up what is there, shows what is about to happen, and only
 * then writes - straight into blob storage over the REST API. Nothing has to be installed on the
 * tenant for a deploy; only the Loader script that serves the result lives there.
 *
 * A blob that does not exist yet is created with its mime type set. One that does is read first
 * and written to a Deploy backup on disk - read back off disk and checked by size and hash before
 * the tenant is touched - then overwritten in place, keeping its id. Every write is read back and
 * compared byte for byte with what was sent. Content identical to what is already there is
 * skipped, with the backup kept. Nothing is ever rolled back automatically: a failure partway
 * leaves the tenant as it is and prints what landed and how to put the backup back.
 *
 * Flags, after "--" so npm passes them through:
 *   --no-build       deploy what is already in dist/ instead of building first
 *   --yes            skip the app-name confirmation every target but the dev target asks for
 *
 * Plain .mjs, not TypeScript: node runs .ts unflagged only from 22.18, and this has to work in
 * older projects on older node.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPrompter,
  DEPLOY_BACKUP_DIR,
  DEPLOY_COOKIES_FILE,
  DEV_URL_MODULE_FILE,
  displayPath,
  heading,
  log,
  LOG_PREFIX,
  readDeployConfig,
  readDevUrl,
  readPackageName,
  writeDevUrlModule
} from "./deploy-config.mjs";
import { fetchCookies, formatCookieHeader, resolveTenantUrl, REST_COOKIES } from "./fetch-cookies.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// The BLOB agent reads and writes a blob by id; archive/dynamic is what finds the id, querying the
// BinaryObject table by Conceptual type the way SearchEngine queries any table.
const BLOB_AGENT_PATH = "api/v1/Agents/BLOB/";
const ARCHIVE_PATH = "api/v1/archive/dynamic";
const BLOB_ID_FIELD = "BinaryObject.BinaryObject_id";
const BLOB_MIME_TYPE_FIELD = "BinaryObject.mimeType";
const BLOB_CONCEPTUAL_TYPE_FIELD = "BinaryObject.conceptualType";

// Enough rows to tell one match from several - an ambiguity is never resolved by picking one
const FIND_LIMIT = 10;

// Where vite.config.ts puts the build - it names the two files below so a deploy has exactly two
// things to look for.
const BUILD_DIR = join(projectRoot, "dist");

// The Loader script derives the same Conceptual types from the app name in its URL, so this is the
// one contract between the two: ccApp..<appName>..build-js and ccApp..<appName>..style-css.
const CONCEPTUAL_TYPE_PREFIX = "ccApp..";
const APP_FILES = [
  { fileName: "build.js", conceptualTypeSuffix: "build-js", mimeType: "text/javascript" },
  { fileName: "style.css", conceptualTypeSuffix: "style-css", mimeType: "text/css" }
];

// Where the Loader script lives on a tenant, and the include id it is pasted under. It serves every
// Vue app there and takes the one to serve from the URL, so this plus the app name is the address a
// deploy can be opened at.
const LOADER_PATH = "CS/scripts/blogic.fcgi?action=doScript&includeId=vue-app-loader";

// Deploy sessions share the browser profile directory the dev cookies already use, as one
// subdirectory per target - the existing ignore rule covers it, and a login on one target never
// replaces another's.
const BROWSER_PROFILE_DIR = join(projectRoot, ".dev-cookies-profile");

// Deploy backups: one directory per deploy under the target, holding the replaced files beside a
// manifest describing them, and a pointer to the newest so recovery never starts by reading
// timestamps. The root is the name the generator gitignores - a backup holds a customer's bundle.
const BACKUP_DIR = join(projectRoot, DEPLOY_BACKUP_DIR);
const MANIFEST_FILE = "manifest.json";
const LATEST_POINTER_FILE = "latest.txt";

/** Formats a byte count with Norwegian thousands separators. */
function formatBytes(bytes) {
  return `${bytes.toLocaleString("nb-NO")} bytes`;
}

/**
 * Names a backup directory for when the deploy ran, in local time: 2026-09-12_1430-12. Readable,
 * sorts in time order, and legal on every filesystem - a raw ISO timestamp carries colons, which
 * Windows refuses in a filename.
 */
function formatBackupStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}-${pad(date.getSeconds())}`;

  return `${day}_${time}`;
}

/** SHA-256 of a file's bytes, as hex - what "shasum -a 256" prints, so a backup can be checked by hand. */
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Reads the flags off the command line. Anything unknown is refused rather than ignored: a typo in
 * a mistyped target would otherwise deploy to the dev target as if nothing had been asked for.
 */
function readOptions(argv) {
  const options = { target: "", build: true, yes: false };
  const remaining = [...argv];

  while (remaining.length > 0) {
    const argument = remaining.shift();

    if (argument === "--no-build") {
      options.build = false;
      continue;
    }

    if (argument === "--yes") {
      options.yes = true;
      continue;
    }

    // A bare word is the target: npm passes those straight through, while a --flag before "--"
    // is eaten by npm itself - so "npm run deploy prod" works and "npm run deploy --target prod"
    // never reaches this script.
    if (!argument.startsWith("--")) {
      if (options.target) throw new Error(`Two targets given, "${options.target}" and "${argument}" - name one`);

      options.target = argument;
      continue;
    }

    throw new Error(
      `Unknown flag "${argument}". Deploy somewhere with "npm run deploy <target>", and pass ` +
        `--no-build or --yes after a "--", which npm needs to hand them over.`
    );
  }

  return options;
}

/**
 * Refuses a config whose app name is not this project's package name. A project copied to start a
 * new app carries the original's config, and deploying under that name would write the new app's
 * files over the original's blobs.
 */
function assertAppNameMatchesPackage(config) {
  const packageName = readPackageName();
  if (config.appName === packageName) return;

  throw new Error(
    `appName in deploy.config.json is "${config.appName}", but name in package.json is "${packageName}" - make them the same.`
  );
}

/**
 * Regenerates the dev URL module from the dev target when the two disagree. The config is the
 * source of truth and is edited by hand (ADR 0003), so a difference means the dev target was
 * changed since the last deploy - and "npm run dev" would keep proxying the old tenant until the
 * module follows.
 */
function syncDevUrlModule(config) {
  // Without a dev target there is nothing to generate the module from
  if (!config.devTarget) return;

  const configUrl = config.targets[config.devTarget].url;
  if (readDevUrl() === configUrl) return;

  writeDevUrlModule(configUrl);
  log(`🔗 Dev URL is now ${configUrl} (${displayPath(DEV_URL_MODULE_FILE)})`);
}

/** Picks the target to deploy to: the one named, or the dev target when none was. */
function resolveTarget(config, requestedName) {
  const name = requestedName || config.devTarget;

  if (!name) {
    const known = Object.keys(config.targets).join(", ");
    if (!known) throw new Error("No targets in deploy.config.json - add one under targets.");

    throw new Error(`Which target? Run "npm run deploy <target>" with one of: ${known}.`);
  }

  if (!Object.hasOwn(config.targets, name)) {
    const known = Object.keys(config.targets).join(", ") || "none";
    throw new Error(`Unknown target "${name}" - deploy.config.json has: ${known}.`);
  }

  if (!requestedName) log(`No target given - using the dev target "${name}"`);

  return { name, ...config.targets[name] };
}

/**
 * The env files Vite loads for a build in a given mode, beyond the mode-agnostic .env and .env.local.
 * A target's mode is its name, so these are the files that carry its own values.
 */
function envFilesFor(targetName) {
  return [`.env.${targetName}`, `.env.${targetName}.local`];
}

/**
 * Refuses to build a target that has no env file of its own when other targets do. Web service
 * keys and include ids are baked into the bundle at build time, and differ per tenant: building
 * without the target's file silently ships another tenant's values, and every call from the app
 * then fails on the tenant. The development and deploy files are Vite's and this client's own,
 * not a target's.
 */
function assertTargetEnvFile(target) {
  const ownFiles = envFilesFor(target.name);
  if (ownFiles.some((file) => existsSync(join(projectRoot, file)))) return;

  const notATarget = new Set([".env", ".env.local", ".env.development", ".env.development.local", DEPLOY_COOKIES_FILE]);
  const otherTargetFiles = readdirSync(projectRoot).filter((file) => file.startsWith(".env.") && !notATarget.has(file));
  if (otherTargetFiles.length === 0) return;

  throw new Error(
    `No ${ownFiles[0]} for target "${target.name}", but the app has ${otherTargetFiles.join(", ")} - ` +
      `the build would ship another target's values. Add ${ownFiles[0]} with this target's.`
  );
}

/**
 * Runs the project's build in the target's mode, so Vite loads .env.<target> and the bundle
 * carries that tenant's values. Fails the deploy when the build fails - a broken bundle must never
 * reach a tenant, and neither must a stale dist/ from before the fix.
 */
function buildApp(target) {
  assertTargetEnvFile(target);

  const envFile = envFilesFor(target.name).find((file) => existsSync(join(projectRoot, file)));
  log(envFile ? `🔨 Building with ${envFile}...` : "🔨 Building...");

  const result = spawnSync("npm", ["run", "build", "--", "--mode", target.name], {
    cwd: projectRoot,
    stdio: "inherit",
    // npm is a .cmd shim on Windows, which Node will only run through a shell
    shell: process.platform === "win32"
  });

  if (result.error) throw new Error(`Could not run "npm run build": ${result.error.message}`);
  if (result.status !== 0) throw new Error("The build failed - nothing was deployed.");
}

/** Reads the built files off dist/, naming the one that is missing rather than deploying half an app. */
function readBuiltFiles(appName, wasBuilt) {
  const files = [];

  for (const appFile of APP_FILES) {
    const path = join(BUILD_DIR, appFile.fileName);

    if (!existsSync(path)) {
      const hint = wasBuilt ? "the build did not emit it" : "build first, or run without --no-build";
      throw new Error(`${displayPath(path)} is missing - ${hint}.`);
    }

    files.push({
      ...appFile,
      conceptualType: `${CONCEPTUAL_TYPE_PREFIX}${appName}..${appFile.conceptualTypeSuffix}`,
      content: readFileSync(path)
    });
  }

  return files;
}

/**
 * The env variable a target's deploy session is stored under - DEPLOY_COOKIES_PROD for "prod".
 * Every run of non-alphanumerics collapses to one underscore, so targets that differ only by
 * separator ("prod-eu" and "prod.eu") would share a session. Unlikely enough to live with,
 * and visible here rather than as a mystery in the wild.
 */
function toCookiesEnvKey(targetName) {
  return `DEPLOY_COOKIES_${targetName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Makes sure there is a working session for the target and returns it as the tenant session every
 * REST call needs: the URL the target resolves to - where the writes actually go, which can differ
 * from the one typed into the config - the Cookie header value and the XSRF token. Only the REST
 * pair is sent, with the token mirrored into a header; the CRMScript pair would just be noise on
 * the wire (ADR 0004).
 */
async function loginToTarget(target) {
  const tenantUrl = await resolveTenantUrl(target.url);

  const cookies = await fetchCookies({
    tenantUrl,
    envKey: toCookiesEnvKey(target.name),
    envFilePath: join(projectRoot, DEPLOY_COOKIES_FILE),
    profileDir: join(BROWSER_PROFILE_DIR, target.name),
    wrongTenantHint: `Change the url of target "${target.name}" in deploy.config.json`
  });

  return {
    tenantUrl,
    cookieHeader: formatCookieHeader(cookies, REST_COOKIES),
    xsrfToken: cookies["XSRF-TOKEN"]
  };
}

/**
 * Sends one request to the REST API and returns its parsed body - null for an empty one, which is
 * how SetBlobStream answers when it worked. A dead session is answered with the HTML login page
 * rather than a 401, so a body that is not JSON is reported as itself.
 */
async function callRest(session, method, path, payload) {
  const url = new URL(path, session.tenantUrl).toString();
  const name = path.split("?")[0].replace("api/v1/", "").replace("Agents/BLOB/", "");

  const headers = {
    Cookie: session.cookieHeader,
    "X-XSRF-TOKEN": session.xsrfToken,
    Accept: "application/json",
    PartnerOrigin: "Cloud Connection"
  };
  if (payload) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(url, { method, headers, ...(payload && { body: JSON.stringify(payload) }) });
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${error.message}`);
  }

  const body = (await response.text()).trim();

  if (!response.ok) {
    throw new Error(`${name} answered HTTP ${response.status} ${response.statusText}${body ? `\n\n${body.slice(0, 1500)}` : ""}`);
  }

  if (!body) return null;

  if (body.startsWith("<")) {
    throw new Error(`${name} answered with an HTML page instead of JSON - the session has expired, or the host is wrong.\n\n${body.slice(0, 1500)}`);
  }

  return JSON.parse(body);
}

/** Posts to one BLOB agent endpoint. */
function callBlobAgent(session, endpoint, payload) {
  return callRest(session, "POST", `${BLOB_AGENT_PATH}${endpoint}`, payload);
}

/** The archive rows of the blobs carrying a Conceptual type - id and mime type, keyed by column name. */
async function findBlobs(session, conceptualType) {
  const params = new URLSearchParams({
    $select: `${BLOB_ID_FIELD},${BLOB_MIME_TYPE_FIELD}`,
    $filter: `${BLOB_CONCEPTUAL_TYPE_FIELD} eq '${conceptualType}'`,
    $top: String(FIND_LIMIT)
  });

  const result = await callRest(session, "GET", `${ARCHIVE_PATH}?${params}`);
  if (!result || !Array.isArray(result.value)) throw new Error("archive/dynamic answered without a list of rows");

  return result.value;
}

/** Reads a blob's content - base64 on the wire, bytes here. */
async function readBlob(session, blobId) {
  const stream = await callBlobAgent(session, "GetBlobStream", { BlobEntityId: blobId });

  if (typeof stream !== "string") {
    throw new Error(`Reading ${blobId} from the target answered with ${typeof stream}, not a base64 string`);
  }

  return Buffer.from(stream, "base64");
}

/**
 * Looks every file up by Conceptual type before anything is written, reading the current content
 * of the ones that exist - the backup and the unchanged check both come from this one read, and
 * that read decides the action: create a blob that is not there, update one that holds something
 * else, or skip one that already holds this exact build. A Conceptual type carried by more than
 * one blob stops the deploy here; that is never resolved by guessing, and the Loader script would
 * be guessing too.
 */
async function inspectFiles(session, files) {
  log("🔎 Reading what is on the target...");

  const inspected = [];

  for (const file of files) {
    const rows = await findBlobs(session, file.conceptualType);

    if (rows.length > 1) {
      const ids = rows.map((row) => row[BLOB_ID_FIELD]).join(", ");
      throw new Error(
        `${file.fileName} matches ${rows.length} files on the target (${ids}) - cannot tell which one is the ` +
          "app's, so nothing was written. Remove the ones that are not before deploying again."
      );
    }

    if (rows.length === 0) {
      log(`   ${file.fileName} - does not exist yet`);
      inspected.push({ ...file, existing: null, action: "create" });
      continue;
    }

    const blobId = Number(rows[0][BLOB_ID_FIELD]);
    if (!Number.isInteger(blobId)) throw new Error(`The target answered without an id for ${file.fileName}`);

    const content = await readBlob(session, blobId);
    const existing = {
      blobId,
      mimeType: rows[0][BLOB_MIME_TYPE_FIELD] ?? "",
      content,
      sha256: sha256(content)
    };
    log(`   ${file.fileName} - ${formatBytes(content.length)}, ${existing.mimeType}`);

    // Compared byte for byte rather than by hash, since the whole file is in hand anyway
    const action = existing.content.equals(file.content) ? "unchanged" : "update";
    inspected.push({ ...file, existing, action });
  }

  return inspected;
}

/** The manifest written beside the backed-up files, so a restore knows exactly what it is handing back. */
function buildManifest(config, target, tenantUrl, takenAt, existingFiles) {
  return {
    appName: config.appName,
    target: target.name,
    tenantUrl,
    takenAt: takenAt.toISOString(),
    blobs: existingFiles.map((file) => ({
      fileName: file.fileName,
      conceptualType: file.conceptualType,
      blobId: file.existing.blobId,
      mimeType: file.existing.mimeType,
      size: file.existing.content.length,
      sha256: file.existing.sha256
    }))
  };
}

/**
 * Reads a backed-up file back off disk and compares it, size then hash, with what the tenant
 * returned. A backup that cannot be confirmed stops the deploy here, before the tenant is
 * touched - a backup found wanting after the write is no backup at all.
 */
function verifyBackupFile(path, file, targetName) {
  const onDisk = readFileSync(path);
  const { existing } = file;

  let difference = "";
  if (onDisk.length !== existing.content.length) {
    difference = `${formatBytes(onDisk.length)} on disk, ${formatBytes(existing.content.length)} returned for blob ${existing.blobId}`;
  } else if (sha256(onDisk) !== existing.sha256) {
    difference = `same size, different sha256 for blob ${existing.blobId}`;
  }
  if (!difference) return;

  throw new Error(
    `${displayPath(path)} does not hold what the tenant returned (${difference}) - the backup cannot be confirmed, ` +
      `so nothing was written to "${targetName}". Do not restore from this directory; run the deploy again.`
  );
}

/**
 * Writes the Deploy backup: every blob that exists, as it is right now, into one directory for
 * this deploy under the target, each file read back off disk and verified as it lands, with the
 * manifest beside them once every file is. Taken before anything is written and whether or not
 * the file turns out to be unchanged, so no deploy is irreversible - and never pruned: the one
 * needed years from now has to still be there. Returns null when nothing exists yet, since there
 * is nothing to back up. latest.txt is not moved here - see recordLatestBackup.
 */
function writeBackup(config, target, tenantUrl, files) {
  const existingFiles = files.filter((file) => file.existing);
  if (existingFiles.length === 0) {
    log("Nothing to back up - no files on the target yet");
    return null;
  }

  const takenAt = new Date();
  const stamp = formatBackupStamp(takenAt);
  const targetDir = join(BACKUP_DIR, target.name);
  const backupDir = join(targetDir, stamp);

  mkdirSync(targetDir, { recursive: true });

  // The stamp resolves to the second, so a second deploy inside it must not write into the first's
  // directory and silently mix two backups
  if (existsSync(backupDir)) {
    throw new Error(`${displayPath(backupDir)} already exists - a backup was taken this very second. Run the deploy again.`);
  }

  mkdirSync(backupDir);

  for (const file of existingFiles) {
    const path = join(backupDir, file.fileName);
    writeFileSync(path, file.existing.content);
    verifyBackupFile(path, file, target.name);
  }

  // Written last, so a directory without one is a backup that never verified
  const manifest = buildManifest(config, target, tenantUrl, takenAt, existingFiles);
  writeFileSync(join(backupDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  const count = existingFiles.length === 1 ? "1 file" : `${existingFiles.length} files`;
  log(`💾 Backed up ${count}, read back and verified:`);
  log(`   ${backupDir}`);

  return { dir: backupDir, targetDir, stamp, files: existingFiles };
}

/**
 * Points the target's latest.txt at this deploy's backup. Confirmation happens before any of this
 * runs, so a backup taken here is always one for a deploy that is actually going ahead.
 */
function recordLatestBackup(backup) {
  // Nothing existed, so there is no backup to point at
  if (!backup) return;

  const pointer = join(backup.targetDir, LATEST_POINTER_FILE);
  writeFileSync(pointer, `${backup.stamp}\n`, "utf-8");
  log(`   ${displayPath(pointer)} -> ${backup.stamp}`);
}

/** The banner's line for one file: what will be done to it, and what is there now. */
function describePlannedWrite(file) {
  const built = `${formatBytes(file.content.length)}, ${file.mimeType}`;

  if (file.action === "create") return `Create ${file.fileName} - ${built}`;

  if (file.action === "unchanged") return `Skip   ${file.fileName} - the target already holds this build`;

  return `Update ${file.fileName} - ${formatBytes(file.existing.content.length)} -> ${built}`;
}

/**
 * Says exactly what is about to happen before it happens: which target, which tenant it resolves
 * to, and for every file whether it is created, written over or skipped - and if written over,
 * which blob that is and what it holds, so a wrong target is caught here rather than in the backup
 * afterwards. The resolved URL is shown because it is where the writes go - it can differ from the
 * one typed into the config (ADR 0004).
 */
function printBanner(config, target, tenantUrl, files) {
  // The resolved URL always carries a trailing slash, so compare normalised - otherwise a
  // hand-edited config without one reports every deploy as going somewhere it was not configured
  const normalisedTargetUrl = target.url.endsWith("/") ? target.url : `${target.url}/`;
  const configuredUrl = normalisedTargetUrl === tenantUrl ? "" : ` (configured as ${target.url})`;
  const role = target.name === config.devTarget ? " (the dev target)" : "";

  log(`📋 "${config.appName}" -> "${target.name}"${role}`);
  log(`   Tenant: ${tenantUrl}${configuredUrl}`);

  for (const file of files) log(`   ${describePlannedWrite(file)}`);
}

/**
 * Makes every target but the dev target cost a deliberate act: the app name has to be typed, not
 * confirmed with a keypress, so shipping to a customer tenant never becomes muscle memory. Nothing
 * is configured, so a newly added target asks by default. --yes is the opt-out for a repeated
 * deploy that has already been thought about.
 */
async function confirmTarget(config, target, skipConfirmation) {
  if (target.name === config.devTarget) return;

  if (skipConfirmation) {
    log(`🔐 "${target.name}" is not the dev target - confirmation skipped (--yes)`);
    return;
  }

  const prompter = createPrompter();
  let answer;
  try {
    answer = await prompter.ask(`${LOG_PREFIX} 🔐 Confirm deploying to "${target.name}" by typing the app name`);
  } finally {
    prompter.close();
  }

  if (answer === config.appName) return;

  throw new Error(`"${answer}" is not the app name - nothing was written to "${target.name}".`);
}

/**
 * The commands that put a Deploy backup back on the target, using nothing but this same tooling:
 * copy the backed-up files into dist/ and deploy them without a build. Only what was backed up is
 * copied, so a file that was created new by the failed deploy is left as it is.
 */
function describeRestore(backup, target) {
  // Windows has no cp, and its copy wants the backslashes join() already gives it there
  const copy = process.platform === "win32" ? "copy" : "cp";
  const copies = backup.files.map(
    (file) => `  ${copy} ${displayPath(join(backup.dir, file.fileName))} ${displayPath(join(BUILD_DIR, file.fileName))}`
  );

  return [
    "To put the backed-up files back, copy them into dist/ and deploy them without a build:",
    ...copies,
    `  npm run deploy ${target.name} -- --no-build`
  ].join("\n");
}

/** One landed file for the partial-write report: what was done to it, and how far that got. */
function describeLanded(entry) {
  if (entry.state === "empty") return `${entry.fileName} (created but left empty)`;
  if (entry.state === "unverified") return `${entry.fileName} (written but not verified)`;

  return `${entry.fileName} (${entry.action === "create" ? "created" : "updated"})`;
}

/**
 * Describes a write that failed after earlier ones had landed. Nothing is rolled back - a failure
 * path that writes to the tenant is the last thing wanted once something has already gone wrong -
 * so the message names what landed, says the tenant now holds a mix, and prints how to restore
 * the backup, instead of leaving the operator to work it out under pressure. A blob created for
 * this deploy whose content never arrived is named too, and so is one that took the content but
 * was not read back as sent: the Loader script finds both all the same, and serves what they hold.
 */
function describePartialWrite(error, landed, backup, target) {
  const listed = landed.map(describeLanded).join(", ");
  const count = landed.length === 1 ? "1 file" : `${landed.length} files`;

  let notes = "";
  if (landed.some((entry) => entry.state === "empty")) {
    notes += " The Loader script serves an empty file until a deploy writes over it.";
  }
  if (landed.some((entry) => entry.state === "unverified")) {
    notes += " A file written but not verified may hold something other than what was sent, and the Loader script serves it as it is until a deploy writes over it.";
  }

  const state = backup
    ? `The target now holds a mix of what this deploy wrote and the previous build.${notes}\n\n${describeRestore(backup, target)}`
    : `Nothing was replaced, so there is nothing to put back - the next deploy writes over what landed.${notes}`;

  return `${error.message}\n\n${count} landed before this failed: ${listed}. ${state}`;
}

/** Creates an empty blob under the file's Conceptual type with its mime type set, and returns its id. */
async function createBlob(session, file) {
  const draft = await callBlobAgent(session, "CreateDefaultBlobEntity", {});
  const saved = await callBlobAgent(session, "SaveBlobEntity", {
    ...draft,
    MimeType: file.mimeType,
    ConceptualType: file.conceptualType
  });

  if (!saved?.BlobId) throw new Error(`The target saved ${file.fileName} without giving it an id`);

  return saved.BlobId;
}

/**
 * Reads a blob back after a write, failing when what came back is not what was sent - a bundle the
 * browser gets half of is as broken as a missing one.
 */
async function verifyBlobContent(session, blobId, file) {
  const readBack = await readBlob(session, blobId);
  if (readBack.equals(file.content)) return;

  throw new Error(
    `${file.fileName} read back as ${formatBytes(readBack.length)} after ${formatBytes(file.content.length)} were written - ` +
      "what landed is not what was sent. Check it on the target before deploying again."
  );
}

/**
 * Writes every file that needs writing, reporting each as it lands. A failure partway through
 * stops the loop and is rethrown naming what already landed - see describePartialWrite. A blob has
 * landed as soon as the tenant serves something of this deploy's doing, which is before the write
 * is verified: a new one the moment it is created, since the Loader script finds it from then on,
 * and an existing one the moment the tenant takes the content, since a read-back that then fails
 * leaves it holding the wrong bytes. Either has to be named rather than left behind unmentioned.
 * The unchanged ones are skipped here, not before, so the report reads in the same order as the
 * banner.
 */
async function writeBlobs(session, files, backup, target) {
  log("📤 Writing...");

  const landed = [];

  for (const file of files) {
    if (file.action === "unchanged") {
      log(`   ${file.fileName} - unchanged, skipped`);
      continue;
    }

    const entry = { fileName: file.fileName, action: file.action, blobId: 0, state: "empty" };

    try {
      if (file.action === "create") {
        entry.blobId = await createBlob(session, file);
        // Findable by the Loader script from this moment, so it has landed before its content has
        landed.push(entry);
      } else {
        entry.blobId = file.existing.blobId;
      }

      await callBlobAgent(session, "SetBlobStream", { BlobEntityId: entry.blobId, Stream: file.content.toString("base64") });
      // The tenant took the content, so the blob no longer holds what it did - landed, verified or not
      entry.state = "unverified";
      if (file.action === "update") landed.push(entry);

      await verifyBlobContent(session, entry.blobId, file);
      entry.state = "written";
    } catch (error) {
      // Nothing landed before the first write, so the API's own error says it all
      if (landed.length === 0) throw error;

      throw new Error(describePartialWrite(error, landed, backup, target));
    }

    const verb = file.action === "create" ? "created" : "overwritten";
    log(`   ${file.fileName} - ${verb}, ${formatBytes(file.content.length)}, verified`);
  }
}

/** Prints where the app can be opened on the target - the last line either way a deploy ends. */
function logAppUrl(config, session) {
  log(`🌐 Open the app at ${session.tenantUrl}${LOADER_PATH}&app=${config.appName}`);
}

/** The deploy: guards, build, login, inspect, back up, banner, confirm, write. */
async function main() {
  const options = readOptions(process.argv.slice(2));

  // Everything that can be checked without the network is checked before it is used
  const config = readDeployConfig();
  assertAppNameMatchesPackage(config);
  const target = resolveTarget(config, options.target);

  // First, so a wrong target costs nothing to back out of - no build, no login, no backup taken
  // for a deploy that was never going ahead
  log(`🦉 Deploying app: ${config.appName}`);
  await confirmTarget(config, target, options.yes);

  // After the guards, so a refused deploy leaves the module alone - and before the build, which
  // imports it through vite.config.ts
  syncDevUrlModule(config);

  heading("BUILDING");
  if (options.build) buildApp(target);
  else log("Skipping the build (--no-build) - deploying dist/");

  const files = readBuiltFiles(config.appName, options.build);

  heading("AUTHENTICATING");
  log(`🍪 Logging in to "${target.name}" (${target.url})...`);
  const session = await loginToTarget(target);

  // Read before write, never after: the backup has to hold what is about to be replaced
  heading("BACKING UP");
  const inspected = await inspectFiles(session, files);
  const backup = writeBackup(config, target, session.tenantUrl, inspected);
  recordLatestBackup(backup);

  heading("ABOUT TO DEPLOY");
  printBanner(config, target, session.tenantUrl, inspected);

  if (inspected.every((file) => file.action === "unchanged")) {
    log("✅ Already up to date - nothing to write");
    logAppUrl(config, session);
    return;
  }

  heading("DEPLOYING");
  await writeBlobs(session, inspected, backup, target);
  log(`🎉 Deployed "${config.appName}" to "${target.name}"`);
  logAppUrl(config, session);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} ${error.message}`);
  process.exit(1);
});
