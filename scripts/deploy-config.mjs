/**
 * Reads deploy.config.json - the one place a project names the SuperOffice tenants it can deploy
 * to and which of them is the dev target. The file is edited by hand; this module checks it and
 * hands it to the deploy client.
 *
 * readDeployConfig() validates the whole file and throws a message naming the field at fault, so
 * a deploy stops on it before anything else happens. readDevUrl() and writeDevUrlModule() are the
 * two sides of src/superoffice-config/superoffice-url.ts, the generated module the Vite proxy and
 * the cookie fetcher read the dev URL from: the deploy client rewrites it from the dev target
 * whenever the two disagree, so neither has to know the config exists. readPackageName(),
 * createPrompter() and displayPath() give the deploy client the name the config is checked
 * against, stdin prompting for the confirmation every target but the dev target asks for, and one
 * way of naming project files in messages. log() and heading() are here for the same reason: the
 * deploy and "npm run deploy:show" speak in one voice.
 *
 * Plain .mjs, not TypeScript: node runs .ts unflagged only from 22.18, and this has to work in
 * older projects on older node.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative } from "node:path";
import { stdin, stdout } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const DEPLOY_CONFIG_FILE = join(projectRoot, "deploy.config.json");
export const DEV_URL_MODULE_FILE = join(projectRoot, "src/superoffice-config/superoffice-url.ts");
const PACKAGE_JSON_FILE = join(projectRoot, "package.json");

// Where deploy sessions and Deploy backups end up. The generator reads these two lines off this
// file's source to write the matching .gitignore entries - cookies are secrets and backups are
// megabytes - so each has to stay a one-line string literal.
export const DEPLOY_COOKIES_FILE = ".env.deploy.local";
export const DEPLOY_BACKUP_DIR = ".deploy-backups";

// The tenant in the generator's default prompt answer. Never a real tenant, so a target still
// holding it is unconfigured rather than configured wrongly.
const PLACEHOLDER_CUST = "CustXXXXX";

// The export line the scaffold writes and writeDevUrlModule rewrites. The cookie fetcher reads
// the URL off it through readDevUrl(), so this is the only place the line is parsed.
const DEV_URL_EXPORT_PATTERN = /DEV_SUPEROFFICE_URL:\s*string\s*=\s*["']([^"']+)["']/;

// Every line either script prints carries it, so the deploy tooling is told apart from npm's own
// output and from the cookie fetcher's.
export const LOG_PREFIX = "[deploy]";

/** Prints a section heading, so the phases of a deploy are told apart at a glance. */
export function heading(title) {
  console.log(`\n${LOG_PREFIX} ${"\u2500".repeat(3)} ${title} ${"\u2500".repeat(Math.max(0, 48 - title.length))}`);
}

/** Prints one line in the voice of the rest of the tooling. */
export function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

/** Path of a project file relative to the project root, for messages. */
export function displayPath(file) {
  return relative(projectRoot, file);
}

/** True if the value is a plain object - the shape every config section has to be. */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the file's overall shape and the app name, throwing the first problem. */
function validateConfigShape(config) {
  const fileName = basename(DEPLOY_CONFIG_FILE);

  if (!isPlainObject(config)) throw new Error(`${fileName} must hold a JSON object`);
  if (!config.appName) throw new Error(`${fileName} is missing appName`);
  if (!isPlainObject(config.targets)) throw new Error(`${fileName} needs targets as an object of named targets`);
  if (typeof config.devTarget !== "string") throw new Error(`${fileName} needs devTarget as a string`);
}

/** Checks one named target, throwing the first problem with it. */
function validateTarget(name, target) {
  const where = `Target "${name}" in ${basename(DEPLOY_CONFIG_FILE)}`;

  if (!isPlainObject(target)) throw new Error(`${where} must be an object with a url`);
  if (!target.url) throw new Error(`${where} has no url`);
  if (target.url.includes(PLACEHOLDER_CUST)) throw new Error(`${where} still has the placeholder tenant ${PLACEHOLDER_CUST} in its url`);
}

/**
 * Checks the dev target. An empty one is allowed - a fresh config may not know its tenants yet -
 * but a named one must exist.
 */
function validateDevTarget(config) {
  if (!config.devTarget) return;

  // Own keys only: a dev target named like an Object.prototype property is not a target either
  if (!Object.hasOwn(config.targets, config.devTarget)) throw new Error(`devTarget "${config.devTarget}" in ${basename(DEPLOY_CONFIG_FILE)} is not one of the targets`);
}

/** Checks that a config is fit to deploy from, throwing the first problem found. Returns the config. */
function validateDeployConfig(config) {
  validateConfigShape(config);

  for (const [name, target] of Object.entries(config.targets)) validateTarget(name, target);
  validateDevTarget(config);

  return config;
}

/** Parses the config file, naming the file rather than leaving a bare JSON error. */
function parseDeployConfig() {
  try {
    return JSON.parse(readFileSync(DEPLOY_CONFIG_FILE, "utf-8"));
  } catch (error) {
    throw new Error(`${basename(DEPLOY_CONFIG_FILE)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Reads deploy.config.json for a deploy. Nothing is repaired: a deploy stops on the first problem
 * and names the field to fix in the file, which is the whole safety net a hand-edited file needs.
 */
export function readDeployConfig() {
  if (!existsSync(DEPLOY_CONFIG_FILE)) {
    throw new Error(
      `No ${basename(DEPLOY_CONFIG_FILE)} yet - write one with appName, devTarget and targets ` +
        "(the generator's README documents every field, with an example)."
    );
  }

  return validateDeployConfig(parseDeployConfig());
}

/** The dev URL the generated module currently holds, or "" when the module or the export is missing. */
export function readDevUrl() {
  if (!existsSync(DEV_URL_MODULE_FILE)) return "";

  const match = readFileSync(DEV_URL_MODULE_FILE, "utf-8").match(DEV_URL_EXPORT_PATTERN);
  return match ? match[1] : "";
}

/** The full text of the generated dev URL module for a URL, header included. */
function renderDevUrlModule(url) {
  return (
    `// Generated file\n` +
    `// Do not edit - change the dev target in deploy.config.json; "npm run deploy" regenerates this file from it.\n` +
    `\n` +
    `/** The URL for the SuperOffice environment you're developing the screen for. */\n` +
    `export const DEV_SUPEROFFICE_URL: string = "${url}";\n`
  );
}

/**
 * Writes the generated dev URL module for a URL. The only writer of the module, so it always
 * carries the header and the export line readDevUrl() parses.
 */
export function writeDevUrlModule(url) {
  mkdirSync(dirname(DEV_URL_MODULE_FILE), { recursive: true });
  writeFileSync(DEV_URL_MODULE_FILE, renderDevUrlModule(url), "utf-8");
}

/** Reads the package name the config's appName is checked against. */
export function readPackageName() {
  const { name } = JSON.parse(readFileSync(PACKAGE_JSON_FILE, "utf-8"));
  if (!name) throw new Error(`${basename(PACKAGE_JSON_FILE)} has no name to use as the app name`);

  return name;
}

/**
 * Reads answers line by line off stdin. Built on readline's "line" events rather than
 * rl.question(), because with piped input readline emits every line as soon as it arrives - a
 * line landing before the next question is asked would be lost, and that question would then
 * wait forever once the input ended. Queueing the lines makes piped and typed input behave alike.
 */
export function createPrompter() {
  const rl = createInterface({ input: stdin, output: stdout });
  const unreadLines = [];
  const waiting = [];
  let inputEnded = false;

  const endedError = () => new Error("Input ended before the last question was answered - nothing was written.");

  /** Hands a line to the question waiting for it, or keeps it until one is asked. */
  function deliverLine(line) {
    const next = waiting.shift();
    if (next) next.resolve(line);
    else unreadLines.push(line);
  }

  /** Fails every question still waiting once the input is gone - nothing else could ever answer them. */
  function rejectWaiting() {
    inputEnded = true;
    for (const next of waiting.splice(0)) next.reject(endedError());
  }

  rl.on("line", deliverLine);
  rl.on("close", rejectWaiting);

  return {
    /** Shows the question and resolves with the trimmed answer. */
    async ask(question) {
      rl.setPrompt(`${question}: `);
      rl.prompt();

      let line;
      if (unreadLines.length > 0) line = unreadLines.shift();
      else if (inputEnded) throw endedError();
      else line = await new Promise((resolve, reject) => waiting.push({ resolve, reject }));

      return line.trim();
    },

    /** Releases stdin, so the process can exit once the caller is done with it. */
    close() {
      rl.close();
    }
  };
}
