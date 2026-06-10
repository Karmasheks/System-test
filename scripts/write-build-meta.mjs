import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.AMVERA_GIT_COMMIT?.trim() || "unknown";
  }
}

const meta = {
  commit: gitSha(),
  builtAt: new Date().toISOString(),
};

const outDir = path.join(process.cwd(), "dist", "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "build-meta.json"), JSON.stringify(meta));
