import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  deleteMe,
  logoutAll,
  forgotPassword,
  verifyOtp,
  resetPassword,
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

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "OTP_RATE_LIMITED",
      message: "Terlalu banyak permintaan kode. Coba lagi nanti.",
    },
  },
});

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, updateMe);
router.delete("/me", authenticate, deleteMe);
router.post("/change-password", authenticate, changePassword);
router.post("/logout-all", authenticate, logoutAll);
router.post("/password/forgot", otpLimiter, forgotPassword);
router.post("/password/verify-otp", otpLimiter, verifyOtp);
router.post("/password/reset", otpLimiter, resetPassword);
export default router;
