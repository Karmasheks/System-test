/**
 * Точка входа Amvera (run.scriptName: index.js).
 * dist/ не в Git — если сборка на Amvera пропущена, собираем перед запуском.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { execSync } from "child_process";

const distIndex = path.join(process.cwd(), "dist", "index.js");

if (!fs.existsSync(distIndex)) {
  console.log("[index.js] dist/index.js не найден — npm run build");
  execSync("npm run build", { stdio: "inherit", env: process.env });
}

await import(pathToFileURL(distIndex).href);
