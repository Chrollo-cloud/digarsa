import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { evidenceUpload } from "../../middleware/upload.middleware.js";
import { requireSellerProfile } from "../services/service.middleware.js";
import {
  acceptBooking,
  completeBooking,
  createBooking,
  declineBooking,
  deliverBooking,
  getCustomerBooking,
  getSellerBooking,
  listCustomerBookings,
  listSellerBookings,
  validateBooking,
} from "./booking.controller.js";
import { decideCancellationRequest, listCancellationRequests, requestBookingCancellation } from "./cancellation.controller.js";

const router = Router();

router.post("/services/:service_id/booking-validation", authenticate, validateBooking);
router.post("/bookings", authenticate, createBooking);
router.get("/me/bookings", authenticate, listCustomerBookings);
router.get("/me/bookings/:booking_id", authenticate, getCustomerBooking);
router.post("/me/bookings/:booking_id/complete", authenticate, completeBooking);
router.post("/me/bookings/:booking_id/cancellation-requests", authenticate, evidenceUpload.single("evidence"), requestBookingCancellation);
router.get("/seller/bookings", authenticate, requireSellerProfile, listSellerBookings);
router.get("/seller/bookings/:booking_id", authenticate, requireSellerProfile, getSellerBooking);
router.post("/seller/bookings/:booking_id/accept", authenticate, requireSellerProfile, acceptBooking);
router.post("/seller/bookings/:booking_id/decline", authenticate, requireSellerProfile, declineBooking);
router.post("/seller/bookings/:booking_id/deliver", authenticate, requireSellerProfile, deliverBooking);
router.get("/admin/cancellation-requests", authenticate, requireRole("ADMIN"), listCancellationRequests);
router.patch("/admin/cancellation-requests/:cancellation_id", authenticate, requireRole("ADMIN"), decideCancellationRequest);

export default router;