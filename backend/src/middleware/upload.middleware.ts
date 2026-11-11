import multer from "multer";

export const ktpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype);
    if (allowed) callback(null, true);
    else (callback as unknown as (error: Error | null, acceptFile: boolean) => void)(new Error("INVALID_KTP_FILE"), false);
  },
});

export const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype);
    if (allowed) callback(null, true);
    else (callback as unknown as (error: Error | null, acceptFile: boolean) => void)(new Error("INVALID_EVIDENCE_FILE"), false);
  },
});
