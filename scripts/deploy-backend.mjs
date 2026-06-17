// EC2에서 git pull → mvn package → systemd 재시작까지 원격으로 한 번에 실행하고
// 단계별/총 소요시간을 출력한다. (frontend의 build:deploy와 같은 패턴, 단 빌드는 EC2에서 수행)
import { execSync } from "node:child_process";

const PEM = "C:\\Users\\wpxm2\\Downloads\\runrace_ec2_key_pair.pem";
const HOST = "ec2-user@15.164.250.88";
const REMOTE_DIR = "/home/ec2-user/runrace";

const ssh = (cmd) => `ssh -i "${PEM}" ${HOST} "${cmd}"`;

const steps = [
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

for (const [label, cmd] of steps) {
  const stepStart = Date.now();
  console.log(`\n▶ ${label} ...`);
  execSync(cmd, { stdio: "inherit" });
  console.log(`✔ ${label} (${fmt(Date.now() - stepStart)})`);
}

console.log(`\n✅ 백엔드 배포 완료 — 총 소요시간 ${fmt(Date.now() - startedAt)}`);
