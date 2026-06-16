/**
 * Деплой с ПК: GitHub + Amvera (main и master).
 * Переменные AMVERA_GIT_* — только локально в .env, НЕ в панели Amvera.
 *
 * npm run deploy:amvera
 */
import { execSync } from "child_process";

function gitAuthEnv() {
  const user = process.env.AMVERA_GIT_USER?.trim();
  const pass = process.env.AMVERA_GIT_PASSWORD?.trim();
  if (!user || !pass) {
    console.warn(
      "[deploy-amvera] AMVERA_GIT_USER / AMVERA_GIT_PASSWORD не заданы в .env — git использует сохранённые credentials Windows."
    );
    return {};
  }
  const b64 = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${b64}`,
  };
}

function run(cmd, env = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
}

function pushAmvera(refSpec, authEnv) {
  try {
    run(`git push amvera ${refSpec}`, authEnv);
    return true;
  } catch {
    return false;
  }
}

const auth = gitAuthEnv();

run("git push origin main");
pushAmvera("main", auth);

if (!pushAmvera("main:master", auth)) {
  console.log("[deploy-amvera] master расходится с main — force-with-lease...");
  if (!pushAmvera("main:master --force-with-lease", auth)) {
    console.error("[deploy-amvera] FATAL: не удалось обновить amvera/master");
    process.exit(1);
  }
}

console.log("[deploy-amvera] OK — Amvera main и master синхронизированы с origin/main");
