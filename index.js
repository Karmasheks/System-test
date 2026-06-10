/**
 * Точка входа Amvera (run.scriptName: index.js).
 * dist/ не в Git — если сборка на Amvera пропущена, собираем перед запуском.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { execSync } from "child_process";

const distIndex = path.join(process.cwd(), "dist", "index.js");
const clientIndex = path.join(process.cwd(), "client", "index.html");

if (!fs.existsSync(distIndex)) {
  if (!fs.existsSync(clientIndex)) {
    console.error(
      "[index.js] Нет dist/index.js и client/ — пересоберите проект на Amvera (build.additionalCommands).",
    );
    process.exit(1);
  }
  console.log("[index.js] dist/index.js не найден — npm run build");
  execSync("npm run build", { stdio: "inherit", env: process.env });
}

if (!fs.existsSync(distIndex)) {
  console.error("[index.js] Сборка не создала dist/index.js");
  process.exit(1);
}

await import(pathToFileURL(distIndex).href);
