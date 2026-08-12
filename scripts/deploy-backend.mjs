// 로컬 테스트 게이트 → EC2에서 git pull → mvn package → systemd 재시작까지 한 번에 실행하고
// 단계별/총 소요시간을 출력한다. (EC2 빌드는 -DskipTests 유지: 테스트는 로컬에서만 돌려 EC2 시간을 늘리지 않는다)
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PEM = "C:\\Users\\wpxm2\\Downloads\\runrace_ec2_key_pair.pem";
const HOST = "ec2-user@15.164.250.88";
const REMOTE_DIR = "/home/ec2-user/runrace";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const MVNW = path.join(BACKEND_DIR, "mvnw.cmd");

const ssh = (cmd) => `ssh -i "${PEM}" ${HOST} "${cmd}"`;

const steps = [
  // 깨진 코드가 EC2까지 가지 않도록 배포 전 로컬에서 테스트(실패 시 배포 중단).
  // EC2가 아닌 로컬에서 돌려 원격 빌드 시간은 그대로 둔다. -o(오프라인)로 빠르게.
  ["테스트(로컬)", `"${MVNW}" -o test`, BACKEND_DIR],
  ["코드 받기", ssh(`cd ${REMOTE_DIR} && git pull origin main`)],
  [
    "빌드",
    ssh(`cd ${REMOTE_DIR}/backend && MAVEN_OPTS=-Xmx512m ./mvnw -q clean package -DskipTests`),
  ],
  ["재시작", ssh("sudo systemctl restart runrace")],
];

function fmt(ms) {
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s.toFixed(1)}초` : `${s.toFixed(1)}초`;
}

const startedAt = Date.now();

for (const [label, cmd, cwd] of steps) {
  const stepStart = Date.now();
  console.log(`\n▶ ${label} ...`);
  execSync(cmd, { stdio: "inherit", cwd });
  console.log(`✔ ${label} (${fmt(Date.now() - stepStart)})`);
}

console.log(`\n✅ 백엔드 배포 완료 — 총 소요시간 ${fmt(Date.now() - startedAt)}`);
