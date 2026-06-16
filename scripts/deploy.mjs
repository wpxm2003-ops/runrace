// 프론트 빌드 → 압축 → EC2 업로드까지 한 번에 실행하고 총 소요시간을 출력한다.
// (build:deploy에서 호출 — cwd는 frontend)
import { execSync } from "node:child_process";

const PEM = "C:\\Users\\wpxm2\\Downloads\\runrace_ec2_key_pair.pem";

const steps = [
  ["빌드", "npm run build"],
  ["압축", "tar -czf out.tar.gz -C out ."],
  ["업로드", `scp -i "${PEM}" out.tar.gz ec2-user@15.164.250.88:/tmp/`],
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

console.log(`\n✅ 배포 완료 — 총 소요시간 ${fmt(Date.now() - startedAt)}`);
