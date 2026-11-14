import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan." },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Format JSON tidak valid." },
    });
    return;
  }

  if (
    (error instanceof Error && ["INVALID_KTP_FILE", "INVALID_EVIDENCE_FILE"].includes(error.message)) ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "MulterError")
  ) {
    res.status(400).json({
      error: {
        code: error instanceof Error && error.message === "INVALID_EVIDENCE_FILE" ? "INVALID_EVIDENCE_FILE" : "INVALID_KTP_FILE",
        message: error instanceof Error && error.message === "INVALID_EVIDENCE_FILE"
          ? "Bukti harus berupa JPG, PNG, atau PDF maksimal 5 MB."
          : "KTP harus berupa JPG, PNG, atau PDF dengan ukuran maksimal 5 MB.",
      },
    });
    return;
  }

  const safeError = error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError" };
  console.error("[UNHANDLED ERROR]", safeError);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Terjadi kesalahan pada server.",
    },
  });
};
