import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
  applySeller,
  getMySellerProfile,
  getPublicSellerProfile,
  updateMySellerProfile,
} from "./seller.controller.js";
import {
  identityVerificationUnavailable,
  getMySellerVerification,
} from "./verification.controller.js";
import {
  decideActivationReview,
  getActivationReview,
  getMyActivationReview,
  listActivationReviews,
  submitActivationReview,
  withdrawActivationReview,
} from "./activation-review.controller.js";
import { requireSellerProfile } from "../services/service.middleware.js";
import portfolioRoutes from "../portfolio/portfolio.routes.js";

const router = Router();

router.post("/apply", authenticate, applySeller);

router.get(
  "/me",
  authenticate,
  getMySellerProfile,
);

router.patch(
  "/me",
  authenticate,
  updateMySellerProfile,
);

router.get("/me/verification", authenticate, getMySellerVerification);
router.post("/me/verification", authenticate, requireRole("USER"), identityVerificationUnavailable);

router.get("/me/activation-review", authenticate, requireRole("USER"), requireSellerProfile, getMyActivationReview);
router.post("/me/activation-review", authenticate, requireRole("USER"), requireSellerProfile, submitActivationReview);
router.delete("/me/activation-review", authenticate, requireRole("USER"), requireSellerProfile, withdrawActivationReview);
router.use("/me/portfolio", portfolioRoutes);

router.get("/admin/verifications", authenticate, requireRole("ADMIN"), identityVerificationUnavailable);
router.get("/admin/verifications/:id/document", authenticate, requireRole("ADMIN"), identityVerificationUnavailable);
router.patch("/admin/verifications/:id", authenticate, requireRole("ADMIN"), identityVerificationUnavailable);
router.get("/admin/activation-reviews", authenticate, requireRole("ADMIN"), listActivationReviews);
router.get("/admin/activation-reviews/:review_id", authenticate, requireRole("ADMIN"), getActivationReview);
router.patch("/admin/activation-reviews/:review_id", authenticate, requireRole("ADMIN"), decideActivationReview);

router.get("/:id", getPublicSellerProfile);


export default router;
