import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PEM = "C:\\Users\\wpxm2\\Downloads\\runrace_ec2_key_pair.pem";
export const HOST = "ec2-user@15.164.250.88";

export function releaseIdentity() {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  if (git("status", "--porcelain", "--untracked-files=no")) {
    throw new Error("Commit tracked changes before deploying.");
  }
  git("fetch", "origin", "main");
  const sha = git("rev-parse", "HEAD");
  if (sha !== git("rev-parse", "origin/main")) {
    throw new Error("Deploy only the committed and pushed origin/main revision.");
  }
  return { sha, id: `${Date.now()}-${sha.slice(0, 12)}` };
}

export function local(command, cwd = ROOT) {
  execSync(command, { cwd, stdio: "inherit" });
}

export function remote(script, args, privileged = false) {
  if (args.some((arg) => !/^[A-Za-z0-9/._-]+$/.test(arg))) {
    throw new Error("Unsafe remote argument");
  }
  execFileSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-i", PEM, HOST,
    `${privileged ? "sudo " : ""}bash -s -- ${args.join(" ")}`,
  ], {
    input: readFileSync(path.join(ROOT, "scripts", script), "utf8").replace(/\r\n/g, "\n"),
    stdio: ["pipe", "inherit", "inherit"],
  });
}

export function step(label, action) {
  const started = Date.now();
  console.log(`\n▶ ${label}`);
  action();
  console.log(`✔ ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
