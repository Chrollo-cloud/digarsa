import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { ktpUpload } from "../../middleware/upload.middleware.js";
import { requireSellerProfile } from "../services/service.middleware.js";
import {
  createSellerProfile,
  applySeller,
  getMySellerProfile,
  getPublicSellerProfile,
  updateMySellerProfile,
} from "./seller.controller.js";
import {
  decideSellerVerification,
  getMySellerVerification,
  getSellerVerificationDocument,
  listSellerVerifications,
  submitSellerVerification,
} from "./verification.controller.js";

const router = Router();

// Fase 2: endpoint lama
router.post("/me", authenticate, createSellerProfile);

// Fase 4: pengajuan seller
router.post("/apply", authenticate, applySeller);

// Profil milik pengguna yang sedang login
router.get("/me", authenticate, getMySellerProfile);
router.patch("/me", authenticate, updateMySellerProfile);

router.get("/me/verification", authenticate, getMySellerVerification);
router.post("/me/verification", authenticate, requireSellerProfile, ktpUpload.single("ktpDocument"), submitSellerVerification);
router.get("/admin/verifications", authenticate, requireRole("ADMIN"), listSellerVerifications);
router.get("/admin/verifications/:id/document", authenticate, requireRole("ADMIN"), getSellerVerificationDocument);
router.patch("/admin/verifications/:id", authenticate, requireRole("ADMIN"), decideSellerVerification);

// Profil publik kreator
router.get("/:id", getPublicSellerProfile);

export default router;
