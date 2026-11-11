import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { requireApprovedSeller, requireSellerProfile } from "./service.middleware.js";

import {
  createService,
  createAvailability,
  deleteService,
  getMyServices,
  getServiceById,
  listCategories,
  listAvailability,
  listServices,
  listServicesForModeration,
  moderateService,
  removeAvailability,
  updateAvailability,
  updateServiceActive,
  updateService,
  updateServiceStatus,
  updateServiceVisibility,
} from "./service.controller.js";

const router = Router();

// Public endpoints
router.get("/categories", listCategories);
router.get("/admin/moderation", authenticate, requireRole("ADMIN"), listServicesForModeration);
router.patch("/admin/moderation/:id", authenticate, requireRole("ADMIN"), moderateService);
router.get("/mine", authenticate, requireSellerProfile, getMyServices);
router.get("/", listServices);

// Seller endpoints
router.post("/", authenticate, requireApprovedSeller, createService);
router.patch("/:id", authenticate, requireSellerProfile, updateService);
router.delete("/:id", authenticate, requireSellerProfile, deleteService);

router.patch("/:id/status", authenticate, requireSellerProfile, updateServiceStatus);
router.patch("/:id/visibility", authenticate, requireSellerProfile, updateServiceVisibility);
router.patch("/:id/active", authenticate, requireSellerProfile, updateServiceActive);

// Availability endpoints
router.get("/:id/availability", authenticate, requireSellerProfile, listAvailability);
router.post("/:id/availability", authenticate, requireSellerProfile, createAvailability);
router.patch("/:id/availability/:slotId", authenticate, requireSellerProfile, updateAvailability);
router.delete("/:id/availability/:slotId", authenticate, requireSellerProfile, removeAvailability);

// Public service detail (keep after fixed paths)
router.get("/:id", getServiceById);

export default router;
