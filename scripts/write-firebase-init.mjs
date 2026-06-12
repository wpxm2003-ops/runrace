/**
 * EC2 등 자체 호스팅 시 signInWithRedirect 가 /__/firebase/init.json 을 요청함
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend");
const outDir = join(root, "public", "__", "firebase");
const outFile = join(outDir, "init.json");

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      const val = t.slice(i + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

loadEnvFile(join(root, ".env.production"));
loadEnvFile(join(root, ".env.local"));

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
// 웹 푸시(FCM 웹)용 — 선택. 있으면 init.json에 포함해 서비스워커가 메시징을 초기화한다.
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

if (!apiKey || !authDomain || !projectId || !appId) {
  console.error("Missing Firebase env. Check frontend/.env.local and .env.production");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify(
    { apiKey, authDomain, projectId, appId, ...(messagingSenderId ? { messagingSenderId } : {}) },
    null,
    2,
  ) + "\n",
);
console.log("Wrote", outFile, "authDomain=", authDomain);

// 단일 경로 요청 대비 (일부 handler)
const altDir = join(root, "public", "firebase");
mkdirSync(altDir, { recursive: true });
writeFileSync(join(altDir, "init.json"), readFileSync(outFile));
console.log("Wrote", join(altDir, "init.json"));
