import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { evidenceUpload } from "../../middleware/upload.middleware.js";
import { requireApprovedSeller } from "../services/service.middleware.js";
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
import {
  acceptRevisionRejection, createRevisionRequest, deliverRevisedWork,
  listCustomerRevisions, listSellerRevisions, requestClarificationAfterRejection,
  requestRevisionAssistance, respondToRevision, respondToRevisionClarification,
  returnRevisionQuotaForSystemError, withdrawRevision,
} from "./revision.controller.js";
import { getAdminRevisionAssistance, listAdminRevisionAssistance, transitionAdminRevisionAssistance } from "./revision-assistance.controller.js";
import {
  assignAppealReviewer, createDispute, decideAppeal, decideDispute, getAdminAppeal,
  getAdminDispute, getPartyAppeal, getPartyDispute, linkDisputeMessageEvidence,
  linkDisputeReportEvidence, listAdminAppeals, listAdminDisputes,
  requestDisputeClarification, respondToDisputeClarification, startDisputeReview,
  submitDisputeAppeal,
} from "./dispute.controller.js";
import {
  acceptAdditionalRevisionOffer, createAdditionalRevisionOffer, createAdditionalRevisionRequest,
  listCustomerAdditionalRevisionRequests, listSellerAdditionalRevisionRequests,
  rejectAdditionalRevisionRequest, requestAdditionalRevisionClarification,
  respondToAdditionalRevisionClarification, withdrawAdditionalRevisionRequest,
} from "./additional-revision.controller.js";
import { completeDemoAdditionalWork, deliverDemoAdditionalWork, getDemoPaymentAvailability, payAdditionalRevisionWithDemo, payBookingWithDemo, startDemoAdditionalWork } from "../payments/demo-payment.controller.js";

const router = Router();

router.get("/payments/demo/availability", authenticate, requireRole("USER"), getDemoPaymentAvailability);
router.post("/me/bookings/:booking_id/demo-payment", authenticate, requireRole("USER"), payBookingWithDemo);
router.post("/me/bookings/:booking_id/additional-revision-agreements/:agreement_id/demo-payment", authenticate, requireRole("USER"), payAdditionalRevisionWithDemo);
router.post("/seller/bookings/:booking_id/additional-revision-agreements/:agreement_id/demo-start", authenticate, requireApprovedSeller, startDemoAdditionalWork);
router.post("/seller/bookings/:booking_id/additional-revision-agreements/:agreement_id/demo-deliver", authenticate, requireApprovedSeller, deliverDemoAdditionalWork);
router.post("/me/bookings/:booking_id/additional-revision-agreements/:agreement_id/demo-complete", authenticate, requireRole("USER"), completeDemoAdditionalWork);

router.post("/services/:service_id/booking-validation", authenticate, requireRole("USER"), validateBooking);
router.post("/bookings", authenticate, requireRole("USER"), createBooking);
router.get("/me/bookings", authenticate, requireRole("USER"), listCustomerBookings);
router.get("/me/bookings/:booking_id", authenticate, requireRole("USER"), getCustomerBooking);
router.post("/me/bookings/:booking_id/complete", authenticate, requireRole("USER"), completeBooking);
router.post("/me/bookings/:booking_id/cancellation-requests", authenticate, requireRole("USER"), evidenceUpload.single("evidence"), requestBookingCancellation);
router.get("/me/bookings/:booking_id/revisions", authenticate, requireRole("USER"), listCustomerRevisions);
router.post("/me/bookings/:booking_id/revisions", authenticate, requireRole("USER"), createRevisionRequest);
router.post("/me/bookings/:booking_id/revisions/:revision_id/withdraw", authenticate, requireRole("USER"), withdrawRevision);
router.post("/me/bookings/:booking_id/revisions/:revision_id/accept-rejection", authenticate, requireRole("USER"), acceptRevisionRejection);
router.post("/me/bookings/:booking_id/revisions/:revision_id/clarifications", authenticate, requireRole("USER"), requestClarificationAfterRejection);
router.post("/me/bookings/:booking_id/revisions/:revision_id/clarifications/:clarification_id/respond", authenticate, requireRole("USER"), respondToRevisionClarification);
router.post("/me/bookings/:booking_id/revisions/:revision_id/assistance", authenticate, requireRole("USER"), requestRevisionAssistance);
router.get("/me/bookings/:booking_id/additional-revision-requests", authenticate, requireRole("USER"), listCustomerAdditionalRevisionRequests);
router.post("/me/bookings/:booking_id/additional-revision-requests", authenticate, requireRole("USER"), createAdditionalRevisionRequest);
router.post("/me/bookings/:booking_id/additional-revision-requests/:request_id/withdraw", authenticate, requireRole("USER"), withdrawAdditionalRevisionRequest);
router.post("/me/bookings/:booking_id/additional-revision-requests/:request_id/clarifications/respond", authenticate, requireRole("USER"), respondToAdditionalRevisionClarification);
router.post("/me/bookings/:booking_id/additional-revision-requests/:request_id/offers/:offer_id/accept", authenticate, requireRole("USER"), acceptAdditionalRevisionOffer);
router.get("/seller/bookings", authenticate, requireApprovedSeller, listSellerBookings);
router.get("/seller/bookings/:booking_id", authenticate, requireApprovedSeller, getSellerBooking);
router.get("/seller/bookings/:booking_id/revisions", authenticate, requireApprovedSeller, listSellerRevisions);
router.get("/seller/bookings/:booking_id/additional-revision-requests", authenticate, requireApprovedSeller, listSellerAdditionalRevisionRequests);
router.post("/seller/bookings/:booking_id/additional-revision-requests/:request_id/clarifications", authenticate, requireApprovedSeller, requestAdditionalRevisionClarification);
router.post("/seller/bookings/:booking_id/additional-revision-requests/:request_id/reject", authenticate, requireApprovedSeller, rejectAdditionalRevisionRequest);
router.post("/seller/bookings/:booking_id/additional-revision-requests/:request_id/offers", authenticate, requireApprovedSeller, createAdditionalRevisionOffer);
router.post("/seller/bookings/:booking_id/revisions/:revision_id/respond", authenticate, requireApprovedSeller, respondToRevision);
router.post("/seller/bookings/:booking_id/revisions/:revision_id/deliver", authenticate, requireApprovedSeller, deliverRevisedWork);
router.post("/seller/bookings/:booking_id/revisions/:revision_id/assistance", authenticate, requireApprovedSeller, requestRevisionAssistance);
router.post("/seller/bookings/:booking_id/accept", authenticate, requireApprovedSeller, acceptBooking);
router.post("/seller/bookings/:booking_id/decline", authenticate, requireApprovedSeller, declineBooking);
router.post("/seller/bookings/:booking_id/deliver", authenticate, requireApprovedSeller, deliverBooking);
router.get("/admin/cancellation-requests", authenticate, requireRole("ADMIN"), listCancellationRequests);
router.patch("/admin/cancellation-requests/:cancellation_id", authenticate, requireRole("ADMIN"), decideCancellationRequest);
router.get("/admin/revision-assistance", authenticate, requireRole("ADMIN"), listAdminRevisionAssistance);
router.get("/admin/revision-assistance/:assistance_id", authenticate, requireRole("ADMIN"), getAdminRevisionAssistance);
router.patch("/admin/revision-assistance/:assistance_id", authenticate, requireRole("ADMIN"), transitionAdminRevisionAssistance);
router.post("/admin/revisions/:revision_id/system-error-quota-return", authenticate, requireRole("ADMIN"), returnRevisionQuotaForSystemError);
router.post("/me/bookings/:booking_id/disputes", authenticate, requireRole("USER"), createDispute);
router.post("/seller/bookings/:booking_id/disputes", authenticate, requireRole("USER"), requireSellerProfile, createDispute);
router.get("/me/disputes/:dispute_id", authenticate, requireRole("USER"), getPartyDispute);
router.get("/seller/disputes/:dispute_id", authenticate, requireRole("USER"), requireSellerProfile, getPartyDispute);
router.post("/disputes/:dispute_id/clarifications/:clarification_id/respond", authenticate, requireRole("USER"), respondToDisputeClarification);
router.post("/disputes/:dispute_id/evidence/messages", authenticate, requireRole("USER"), linkDisputeMessageEvidence);
router.post("/disputes/:dispute_id/appeals", authenticate, requireRole("USER"), submitDisputeAppeal);
router.get("/appeals/:appeal_id", authenticate, requireRole("USER"), getPartyAppeal);
router.get("/admin/disputes", authenticate, requireRole("ADMIN"), listAdminDisputes);
router.get("/admin/disputes/:dispute_id", authenticate, requireRole("ADMIN"), getAdminDispute);
router.post("/admin/disputes/:dispute_id/review", authenticate, requireRole("ADMIN"), startDisputeReview);
router.post("/admin/disputes/:dispute_id/clarifications", authenticate, requireRole("ADMIN"), requestDisputeClarification);
router.post("/admin/disputes/:dispute_id/decision", authenticate, requireRole("ADMIN"), decideDispute);
router.post("/admin/disputes/:dispute_id/reports", authenticate, requireRole("ADMIN"), linkDisputeReportEvidence);
router.get("/admin/appeals", authenticate, requireRole("ADMIN"), listAdminAppeals);
router.get("/admin/appeals/:appeal_id", authenticate, requireRole("ADMIN"), getAdminAppeal);
router.post("/admin/appeals/:appeal_id/assignment", authenticate, requireRole("ADMIN"), assignAppealReviewer);
router.post("/admin/appeals/:appeal_id/decision", authenticate, requireRole("ADMIN"), decideAppeal);

export default router;
