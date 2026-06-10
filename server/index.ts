import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./db";

const serverRootDir = path.dirname(fileURLToPath(import.meta.url));
/** Запуск из dist/ (npm start / Amvera) — production, даже если в .env NODE_ENV=development */
const isProductionBundle =
  serverRootDir.endsWith(`${path.sep}dist`) || serverRootDir.endsWith("/dist");
const isProduction = process.env.NODE_ENV === "production" || isProductionBundle;

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

  // Amvera: containerPort 80, PORT не задавать (или 80). Локально: PORT=5000 в .env.
  const defaultPort = isProduction ? 80 : 5000;
  const port = Number(process.env.PORT) || defaultPort;
  const host = process.env.HOST ?? "0.0.0.0";

  if (isProduction && port !== 80) {
    log(
      `warning: production listens on port ${port}, Amvera containerPort обычно 80 — проверьте настройки`
    );
  }

  server.listen(port, host, () => {
    log(`serving on http://${host}:${port} (local: http://127.0.0.1:${port})`);
    log(`mode: ${isProduction ? "production" : "development"}, bundle: ${isProductionBundle}`);
  });
})();
