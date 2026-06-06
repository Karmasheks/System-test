import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "attachments");
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_ROOT);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Недопустимый тип файла"));
    }
  },
});

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;

export function registerUploadRoutes(app: Express, authenticate: AuthMiddleware) {
  app.post(
    "/api/uploads/attachment",
    authenticate,
    (req, res, next) => {
      upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Файл больше 5 МБ" });
          }
          return res.status(400).json({ message: err.message });
        }
        if (err) {
          return res.status(400).json({ message: err.message || "Ошибка загрузки" });
        }
        next();
      });
    },
    (req, res) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "Файл не передан" });
      }
      const displayName = (req.body?.name as string)?.trim() || file.originalname;
      res.status(201).json({
        name: displayName,
        url: `/uploads/attachments/${file.filename}`,
      });
    }
  );
}
