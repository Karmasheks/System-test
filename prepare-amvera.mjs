import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const cwd = process.cwd();
const cleanNodeModules = process.env.AMVERA_CLEAN === "1";

console.log("[prepare-amvera] cwd:", cwd);

function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

const head = tryRun("git rev-parse HEAD");
if (head) console.log("[prepare-amvera] git HEAD:", head);

function listDir(label, dir) {
  try {
    const names = fs.readdirSync(dir);
    console.log(`[prepare-amvera] ${label}:`, names.slice(0, 40).join(", "));
  } catch {
    console.log(`[prepare-amvera] ${label}: (missing)`);
  }
}

listDir("root", cwd);

const clientIndex = path.join(cwd, "client", "index.html");
const hasGit = fs.existsSync(path.join(cwd, ".git"));

function restoreFromGit(target) {
  if (!hasGit) return false;
  console.log(`[prepare-amvera] git restore: ${target}`);
  try {
    execSync(`git checkout HEAD -- ${target}`, { cwd, stdio: "inherit" });
    return true;
  } catch (err) {
    console.warn(`[prepare-amvera] git checkout failed for ${target}:`, err.message);
  }
  try {
    execSync(`git archive HEAD ${target} | tar -x`, { cwd, stdio: "inherit", shell: true });
    return true;
  } catch (err) {
    console.warn(`[prepare-amvera] git archive failed for ${target}:`, err.message);
    return false;
  }
}

if (!fs.existsSync(clientIndex)) {
  console.warn("[prepare-amvera] client/index.html missing");
  restoreFromGit("client");
  restoreFromGit("shared");
}

if (!fs.existsSync(clientIndex)) {
  console.error("[prepare-amvera] FATAL: client/index.html still missing after git restore.");
  listDir("client", path.join(cwd, "client"));
  process.exit(1);
}

console.log("[prepare-amvera] client/index.html OK");

try {
  fs.rmSync(path.join(cwd, "dist"), { recursive: true, force: true });
  console.log("[prepare-amvera] removed dist/");
} catch (err) {
  console.warn("[prepare-amvera] could not remove dist/:", err.message);
}

if (cleanNodeModules) {
  try {
    fs.rmSync(path.join(cwd, "node_modules"), { recursive: true, force: true });
    console.log("[prepare-amvera] removed node_modules/ (AMVERA_CLEAN=1)");
  } catch (err) {
    console.warn("[prepare-amvera] could not remove node_modules/:", err.message);
  }
}
