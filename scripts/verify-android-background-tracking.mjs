import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(
  root,
  "frontend",
  "android",
  "app",
  "src",
  "main",
  "assets",
  "capacitor.config.json",
);

function fail(message) {
  console.error(`\n[background-tracking] ${message}`);
  process.exitCode = 1;
}

if (!existsSync(configPath)) {
  fail(`Missing generated Capacitor config: ${configPath}\nRun: npm run cap:sync:android`);
} else {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (config?.android?.useLegacyBridge !== true) {
      fail(
        "android.useLegacyBridge must be true. Without it, the background-geolocation "
          + "plugin can stop delivering Android location callbacks after a few minutes while locked. "
          + "Run: npm run cap:sync:android",
      );
    } else {
      console.log("[background-tracking] Android legacy bridge is enabled.");
    }
  } catch (error) {
    fail(
      `Could not read generated Capacitor config: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
