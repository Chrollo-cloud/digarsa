import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
  createBookingReview,
  deleteMyReview,
  getPublicReview,
  listMyReviews,
  listSellerReviews,
  listServiceReviews,
  updateMyReview,
} from "./review.controller.js";

const router = Router();

router.post("/bookings/:booking_id/review", authenticate, requireRole("USER"), createBookingReview);
router.get("/services/:service_id/reviews", listServiceReviews);
router.get("/sellers/:seller_id/reviews", listSellerReviews);
router.get("/me/reviews", authenticate, requireRole("USER"), listMyReviews);
router.patch("/me/reviews/:review_id", authenticate, requireRole("USER"), updateMyReview);
router.delete("/me/reviews/:review_id", authenticate, requireRole("USER"), deleteMyReview);
router.get("/reviews/:review_id", getPublicReview);

export default router;
