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

const clientIndex = path.join(cwd, "client", "index.html");
const hasGit = fs.existsSync(path.join(cwd, ".git"));
const fallbackIndex = path.join(cwd, "scripts", "amvera-client-index.html");

function writeClientIndex(content) {
  fs.mkdirSync(path.join(cwd, "client"), { recursive: true });
  fs.writeFileSync(clientIndex, content);
}

function restoreFromGitRef(ref, target) {
  if (!hasGit) return false;
  console.log(`[prepare-amvera] git restore ${target} from ${ref}`);
  if (tryExec(`git checkout ${ref} -- ${target}`)) {
    return true;
  }
  try {
    const content = execSync(`git show ${ref}:${target}`, { encoding: "utf8", cwd });
    const dest = path.join(cwd, target);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    return true;
  } catch {
    return false;
  }
}

function restoreClientTree() {
  if (!hasGit) return false;
  tryRun("git fetch --all --prune");
  tryRun("git reset --hard HEAD");

  if (restoreFromGitRef("HEAD", "client/index.html")) {
    return fs.existsSync(clientIndex);
  }

  restoreFromGitRef("HEAD", "client");
  restoreFromGitRef("HEAD", "shared");

  if (fs.existsSync(clientIndex)) return true;

  const refs = ["origin/main", "origin/HEAD", "main"];
  for (const ref of refs) {
    if (tryRun(`git rev-parse ${ref}`)) {
      restoreFromGitRef(ref, "client/index.html");
      if (fs.existsSync(clientIndex)) {
        console.log(`[prepare-amvera] restored client/index.html from ${ref}`);
        return true;
      }
      restoreFromGitRef(ref, "client");
      restoreFromGitRef(ref, "shared");
      if (fs.existsSync(clientIndex)) return true;
    }
  }

  return fs.existsSync(clientIndex);
}

try {
  fs.rmSync(path.join(cwd, "project-source.tar.gz"), { force: true });
} catch {
  /* ignore */
}

if (!fs.existsSync(clientIndex)) {
  console.warn("[prepare-amvera] client/index.html missing");
  if (hasGit) {
    const tree = tryRun("git ls-tree HEAD client");
    if (tree) console.log("[prepare-amvera] git tree client:", tree);
  }
  restoreClientTree();
}

if (!fs.existsSync(clientIndex) && fs.existsSync(fallbackIndex)) {
  console.log("[prepare-amvera] copy scripts/amvera-client-index.html -> client/index.html");
  writeClientIndex(fs.readFileSync(fallbackIndex, "utf8"));
}

if (!fs.existsSync(clientIndex)) {
  console.error("[prepare-amvera] FATAL: client/index.html still missing after restore.");
  listDir("client", path.join(cwd, "client"));
  if (hasGit) {
    console.log("[prepare-amvera] git ls-files client/index.html:");
    console.log(tryRun("git ls-files client/index.html") ?? "(none)");
  }
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
