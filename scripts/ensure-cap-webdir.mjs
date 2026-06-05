/**
 * CAPACITOR_SERVER_URL 사용 시 out/ 정적 빌드 없이 cap sync 가능하도록 최소 webDir 확보
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend");
const outDir = join(root, "out");
const indexFile = join(outDir, "index.html");

if (!existsSync(indexFile)) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    indexFile,
    "<!DOCTYPE html><html><body>RunRace</body></html>\n",
  );
  console.log("Created minimal", indexFile, "(remote server.url mode)");
}
