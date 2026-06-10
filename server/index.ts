import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./db";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Production-сборка: dist/index.js, index.js (Amvera) или Amvera cwd /app */
function detectProductionBundle(): boolean {
  const fromMeta = normalizePath(path.dirname(fileURLToPath(import.meta.url)));
  if (fromMeta.endsWith("/dist")) return true;

  const fromArgv = normalizePath(process.argv[1] ?? "");
  if (fromArgv.includes("/dist/") || fromArgv.endsWith("/dist/index.js")) return true;
  if (fromArgv.endsWith("/index.js") && !fromArgv.includes("/server/")) return true;

  const cwd = normalizePath(process.cwd());
  const distIndex = path.join(process.cwd(), "dist", "index.js");
  const distBuilt = fs.existsSync(distIndex);

  // Amvera: панель часто запускает server/index.ts + tsx, cwd = /app
  if (distBuilt && cwd === "/app" && fromArgv.includes("/server/index")) return true;

  // Локальный npm run dev
  if (fromArgv.includes("/server/index")) return false;

  if (distBuilt) return true;

  return false;
}

function resolveListenPort(isProd: boolean): number {
  const raw = process.env.PORT?.trim();
  if (isProd) {
    // PORT=5000 часто копируют из локального .env — на Amvera containerPort = 80
    if (!raw || raw === "5000") return 80;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 80;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

const isProductionBundle = detectProductionBundle();
const isProduction = process.env.NODE_ENV === "production" || isProductionBundle;

const app = express();

function readBuildMeta(): { commit?: string; builtAt?: string } {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "dist", "public", "build-meta.json"),
      "utf8",
    );
    return JSON.parse(raw) as { commit?: string; builtAt?: string };
  } catch {
    return {};
  }
}

app.get("/api/health", (_req, res) => {
  const build = readBuildMeta();
  res.json({
    ok: true,
    commit: build.commit ?? null,
    builtAt: build.builtAt ?? null,
  });
});

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database
  await initializeDatabase();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Unhandled error (${status}): ${message}`);
res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  const port = resolveListenPort(isProduction);
  const host = process.env.HOST ?? "0.0.0.0";

  if (isProduction && port !== 80) {
    log(
      `warning: production listens on port ${port}, Amvera containerPort обычно 80 — проверьте настройки`
    );
  }

  server.listen(port, host, () => {
    log(`serving on http://${host}:${port} (local: http://127.0.0.1:${port})`);
    log(
      `mode: ${isProduction ? "production" : "development"}, bundle: ${isProductionBundle}, entry: ${normalizePath(process.argv[1] ?? "")}`
    );
  });
})();
