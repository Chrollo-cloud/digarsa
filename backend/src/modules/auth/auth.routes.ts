import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  getMe,
} from "./auth.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

// Membatasi percobaan login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    error: {
      code: "TOO_MANY_LOGIN_ATTEMPTS",
      message: "Terlalu banyak percobaan login. Coba lagi nanti.",
    },
  },
});

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.get("/me", authenticate, getMe);
export default router;