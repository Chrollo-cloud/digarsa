import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireApprovedSeller } from "./service.middleware.js";
import { updateSellerServiceAvailability } from "./service.controller.js";

const router = Router();

router.patch("/seller/services/:service_id/availability", authenticate, requireApprovedSeller, updateSellerServiceAvailability);

export default router;
