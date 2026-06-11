/**
 * Лёгкая проверка client/ без ожидания /git (в /source /git недоступен).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const cwd = process.cwd();
const clientIndex = path.join(cwd, "client", "index.html");

if (!fs.existsSync(clientIndex) && fs.existsSync(path.join(cwd, ".git"))) {
  try {
    execSync("git reset --hard HEAD", { cwd, stdio: "inherit" });
    execSync("git checkout HEAD -- client shared", { cwd, stdio: "inherit" });
  } catch {
    try {
      execSync("git archive HEAD client shared | tar -x", {
        cwd,
        stdio: "inherit",
        shell: true,
      });
    } catch {
      /* prepare-amvera.mjs в additionalCommands */
    }
  }
}
