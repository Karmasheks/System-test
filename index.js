/**
 * Точка входа Amvera (run.scriptName: index.js).
 * dist/ не в Git — если сборка на Amvera пропущена, собираем перед запуском.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { execSync } from "child_process";

function requireEnv(name, minLength = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    console.error(
      `[index.js] FATAL: переменная ${name} не задана или слишком короткая (мин. ${minLength} символов).`,
    );
    console.error(
      "[index.js] Amvera → Переменные окружения. Нужны: DATABASE_URL, JWT_SECRET, SESSION_SECRET (≥32), NODE_ENV=production.",
    );
    process.exit(1);
  }
  return value;
}

requireEnv("DATABASE_URL", 10);
requireEnv("JWT_SECRET", 32);
requireEnv("SESSION_SECRET", 32);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const port = process.env.PORT?.trim();
if (port && port !== "80" && port !== "5000") {
  console.warn(
    `[index.js] PORT=${port} — на Amvera containerPort обычно 80; удалите PORT или задайте PORT=80.`,
  );
}

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
