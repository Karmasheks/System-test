import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const cwd = process.cwd();
console.log("[prepare-amvera] cwd:", cwd);

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryRun(cmd) {
  try {
    return run(cmd);
  } catch {
    return null;
  }
}

const head = tryRun("git rev-parse HEAD");
if (head) console.log("[prepare-amvera] git HEAD:", head);

function listDir(label, dir) {
  try {
    const names = fs.readdirSync(dir);
    console.log(`[prepare-amvera] ${label}:`, names.slice(0, 30).join(", "));
  } catch {
    console.log(`[prepare-amvera] ${label}: (missing)`);
  }
}

listDir("root", cwd);

const clientIndex = path.join(cwd, "client", "index.html");

if (!fs.existsSync(clientIndex)) {
  console.warn("[prepare-amvera] client/index.html missing — trying git checkout client");

  if (fs.existsSync(path.join(cwd, ".git"))) {
    try {
      execSync("git checkout HEAD -- client", { stdio: "inherit" });
    } catch (err) {
      console.error("[prepare-amvera] git checkout client failed:", err.message);
    }
  }
}

if (!fs.existsSync(clientIndex)) {
  console.error(
    "[prepare-amvera] FATAL: client/index.html still missing. Push full repository to Amvera git (git push amvera main).",
  );
  listDir("client", path.join(cwd, "client"));
  process.exit(1);
}

console.log("[prepare-amvera] client/index.html OK");

for (const dir of ["dist", "node_modules"]) {
  try {
    fs.rmSync(path.join(cwd, dir), { recursive: true, force: true });
    console.log(`[prepare-amvera] removed ${dir}/`);
  } catch (err) {
    console.warn(`[prepare-amvera] could not remove ${dir}/:`, err.message);
  }
}
