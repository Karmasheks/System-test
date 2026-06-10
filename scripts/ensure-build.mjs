import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const distIndex = path.join(process.cwd(), "dist", "index.js");

if (!fs.existsSync(distIndex)) {
  console.log("[ensure-build] dist/index.js не найден — запуск npm run build");
  execSync("npm run build", { stdio: "inherit", env: process.env });
}
