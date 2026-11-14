import { Router } from "express";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { AuthContext } from "../../middleware/auth.middleware.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { getRecommendations } from "./recommendation.controller.js";

const router = Router();

const authenticateGeminiRequests: RequestHandler = (req, res, next) => {
  if (req.query.mode !== "gemini") return next();
  return authenticate(req, res, next);
};

export function createGeminiRecommendationLimiter(limit = 8) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.query.mode !== "gemini",
    keyGenerator: (_req, res) => (res.locals.auth as AuthContext).userId,
    handler: (_req, res) => res.status(429).json({
      error: { code: "AI_RATE_LIMITED", message: "Batas rekomendasi AI per menit tercapai. Coba lagi nanti." },
    }),
  });
}

const geminiRecommendationLimiter = createGeminiRecommendationLimiter();

// Paid model requests require a valid account session and account-scoped rate limit.
router.get("/recommendations", authenticateGeminiRequests, geminiRecommendationLimiter, getRecommendations);

export default router;
