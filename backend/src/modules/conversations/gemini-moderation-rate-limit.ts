import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { AuthContext } from "../../middleware/auth.middleware.js";
import { geminiProvider } from "../../lib/ai/gemini-provider.js";

function accountKey(_req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  const auth = res.locals.auth as AuthContext | undefined;
  return auth?.userId ?? "unauthenticated";
}

const perMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: accountKey,
  handler: (_req, res) => res.status(429).json({
    error: { code: "AI_MODERATION_RATE_LIMITED", message: "Batas pemeriksaan keamanan pesan per menit tercapai." },
  }),
});

const perDay = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: accountKey,
  handler: (_req, res) => res.status(429).json({
    error: { code: "AI_MODERATION_DAILY_LIMITED", message: "Batas pemeriksaan keamanan pesan harian tercapai." },
  }),
});

/** Limits are applied only while Gemini is configured; local fallback remains available without a quota hit. */
export const geminiModerationRateLimit: RequestHandler = (req, res, next) => {
  if (geminiProvider.availability() !== "AVAILABLE") return next();
  return perMinute(req, res, (minuteError) => {
    if (minuteError) return next(minuteError);
    return perDay(req, res, next);
  });
};
