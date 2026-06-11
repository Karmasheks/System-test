/**
 * Amvera: /source часто без client/ при npm install.
 * Ждём /git (полный clone) и копируем client/shared.
 */
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

function sleep(sec) {
  spawnSync("sleep", [String(sec)], { stdio: "ignore" });
}

function logDir(label, dir) {
  try {
    const names = fs.readdirSync(dir);
    console.log(`[amvera-preinstall] ${label}:`, names.slice(0, 30).join(", "));
  } catch {
    console.log(`[amvera-preinstall] ${label}: (missing)`);
  }
}

function waitForGitClient(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    if (fs.existsSync("/git/client/index.html")) {
      return true;
    }
    if (i === 0) {
      console.log("[amvera-preinstall] waiting for /git/client...");
    }
    sleep(2);
  }
  return false;
}

function ensureClientSources() {
  const cwd = process.cwd();
  const clientIndex = path.join(cwd, "client", "index.html");

  if (fs.existsSync(clientIndex)) {
    return;
  }

  if (waitForGitClient()) {
    console.log("[amvera-preinstall] copy client/ from /git");
    execSync("cp -a /git/client ./client", { cwd, stdio: "inherit" });
    if (fs.existsSync("/git/shared")) {
      execSync("cp -a /git/shared ./shared", { cwd, stdio: "inherit" });
    }
  }

  if (!fs.existsSync(clientIndex) && fs.existsSync("/git/.git")) {
    console.log("[amvera-preinstall] git archive client/ from /git");
    try {
      execSync("git -C /git archive HEAD client shared | tar -x -C .", {
        cwd,
        stdio: "inherit",
        shell: true,
      });
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(clientIndex)) {
    console.warn("[amvera-preinstall] WARNING: client/index.html still missing");
    logDir("/git", "/git");
  }
}

ensureClientSources();
