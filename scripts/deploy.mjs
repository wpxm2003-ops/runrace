// Build locally, upload a checksummed release, then switch after validation.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, HOST, PEM, releaseIdentity, local, remote, step } from "./deploy-common.mjs";

const frontend = path.join(ROOT, "frontend");
const { id } = releaseIdentity();
step("Build", () => local("npm run build", frontend));
const archive = path.join(frontend, "out.tar.gz");
step("Archive", () => local("tar -czf out.tar.gz -C out .", frontend));
const checksum = createHash("sha256").update(readFileSync(archive)).digest("hex");
const uploaded = "/tmp/runrace-web-" + id + ".tar.gz";
step("Upload", () => local('scp -i "' + PEM + '" "' + archive + '" ' + HOST + ":" + uploaded));
step("Switch and verify (automatic rollback on failure)", () =>
  remote("deploy-web-remote.sh", [id, uploaded, checksum], true));
console.log("Frontend deployed and verified: " + id);
