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

function tryExec(cmd) {
  try {
    execSync(cmd, { cwd, stdio: "inherit", shell: true });
    return true;
  } catch {
    return false;
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

const clientDir = path.join(cwd, "client");
const clientIndex = path.join(clientDir, "index.html");
const clientMain = path.join(clientDir, "src", "main.tsx");
const hasGit = fs.existsSync(path.join(cwd, ".git"));

function isClientComplete() {
  return fs.existsSync(clientIndex) && fs.existsSync(clientMain);
}

function restoreTreeFromRef(ref, treePath) {
  if (!hasGit) return false;
  console.log(`[prepare-amvera] restore ${treePath}/ from ${ref}`);
  try {
    fs.rmSync(path.join(cwd, treePath), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (tryExec(`git archive ${ref} ${treePath} | tar -x -C .`)) {
    return true;
  }
  return tryExec(`git checkout ${ref} -- ${treePath}`);
}

function restoreClientAndShared() {
  if (!hasGit) return false;
  tryRun("git fetch --all --prune");

  const refs = ["origin/main", "origin/HEAD", "main", "HEAD"];
  for (const ref of refs) {
    if (!tryRun(`git rev-parse ${ref}`)) continue;
    restoreTreeFromRef(ref, "client");
    restoreTreeFromRef(ref, "shared");
    if (isClientComplete()) {
      console.log(`[prepare-amvera] client/ OK from ${ref}`);
      return true;
    }
  }
  return isClientComplete();
}

try {
  fs.rmSync(path.join(cwd, "project-source.tar.gz"), { force: true });
} catch {
  /* ignore */
}

if (!isClientComplete()) {
  console.warn("[prepare-amvera] incomplete client/ (need index.html + src/main.tsx)");
  if (hasGit) {
    const tree = tryRun("git ls-tree HEAD client");
    if (tree) console.log("[prepare-amvera] git tree client:", tree);
  }
  restoreClientAndShared();
}

if (!isClientComplete()) {
  console.error("[prepare-amvera] FATAL: client/ still incomplete after restore.");
  listDir("client", clientDir);
  listDir("client/src", path.join(clientDir, "src"));
  if (hasGit) {
    console.log("[prepare-amvera] git ls-files client/index.html:");
    console.log(tryRun("git ls-files client/index.html") ?? "(none)");
    console.log("[prepare-amvera] git ls-files client/src/main.tsx:");
    console.log(tryRun("git ls-files client/src/main.tsx") ?? "(none)");
  }
  process.exit(1);
}

console.log("[prepare-amvera] client/ OK");

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
