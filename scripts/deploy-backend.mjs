// Keep the running JAR intact while an isolated source tree is being built.
import path from "node:path";
import { ROOT, releaseIdentity, local, remote, step } from "./deploy-common.mjs";

const { id, sha } = releaseIdentity();
const backend = path.join(ROOT, "backend");
const wrapper = process.platform === "win32" ? 'mvnw.cmd' : "bash ./mvnw";
step("Local tests", () => local(wrapper + " -o test", backend));
step("Isolated build, restart and health check (automatic JAR rollback on failure)", () =>
  remote("deploy-backend-remote.sh", [id, sha]));
console.log("Backend deployed and verified: " + id);
