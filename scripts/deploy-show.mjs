#!/usr/bin/env node
/**
 * Prints the targets in deploy.config.json - "npm run deploy:show". Names and URLs, nothing else:
 * no build, no login, no tenant.
 *
 * Plain .mjs, not TypeScript: node runs .ts unflagged only from 22.18, and this has to work in
 * older projects on older node.
 */
import { log, LOG_PREFIX, readDeployConfig } from "./deploy-config.mjs";

/** Prints the app name, then one line per target, marking the dev target. */
function main() {
  const config = readDeployConfig();
  const names = Object.keys(config.targets);

  log(config.appName);

  if (names.length === 0) {
    log("No targets - add one under targets in deploy.config.json");
    return;
  }

  const nameWidth = Math.max(...names.map((name) => name.length));

  for (const name of names) {
    const dev = name === config.devTarget ? "  (dev)" : "";
    log(`  ${name.padEnd(nameWidth)}  ${config.targets[name].url}${dev}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`${LOG_PREFIX} ${error.message}`);
  process.exit(1);
}
