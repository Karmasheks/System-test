/**
 * Amvera: npm install в /source стартует без client/.
 * Clone в /git уже есть — копируем client до npm run build.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const cwd = process.cwd();
const clientIndex = path.join(cwd, "client", "index.html");

if (fs.existsSync(clientIndex)) {
  return;
}

const gitClient = "/git/client/index.html";
if (fs.existsSync(gitClient)) {
  console.log("[amvera-preinstall] copy client/ from /git");
  execSync("cp -a /git/client ./client", { cwd, stdio: "inherit" });
  if (fs.existsSync("/git/shared")) {
    execSync("cp -a /git/shared ./shared", { cwd, stdio: "inherit" });
  }
}

if (!fs.existsSync(clientIndex) && fs.existsSync(path.join(cwd, ".git"))) {
  console.log("[amvera-preinstall] git checkout client/");
  try {
    execSync("git checkout HEAD -- client shared", { cwd, stdio: "inherit" });
  } catch {
    /* ignore */
  }
}

if (!fs.existsSync(clientIndex)) {
  console.warn("[amvera-preinstall] WARNING: client/index.html still missing");
}
