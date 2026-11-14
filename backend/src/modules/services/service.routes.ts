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

router.get("/categories", listCategories);
router.get("/admin/moderation", authenticate, requireRole("ADMIN"), listServicesForModeration);
router.patch("/admin/moderation/:id", authenticate, requireRole("ADMIN"), moderateService);
router.get("/mine", authenticate, requireRole("USER"), requireSellerProfile, getMyServices);
router.post("/", authenticate, requireRole("USER"), requireSellerProfile, createService);
router.get("/", listServices);
router.get("/:id/availability", authenticate, requireApprovedSeller, listAvailability);
router.post("/:id/availability", authenticate, requireApprovedSeller, createAvailability);
router.patch("/:id/availability/:slotId", authenticate, requireApprovedSeller, updateAvailability);
router.delete("/:id/availability/:slotId", authenticate, requireApprovedSeller, removeAvailability);
router.patch("/:id/status", authenticate, requireApprovedSeller, updateServiceStatus);
router.patch("/:id/visibility", authenticate, requireApprovedSeller, updateServiceVisibility);
router.patch("/:id/active", authenticate, requireApprovedSeller, updateServiceActive);
router.get("/:id", getServiceById);
router.patch("/:id", authenticate, requireRole("USER"), requireSellerProfile, updateService);
router.delete("/:id", authenticate, requireRole("USER"), requireSellerProfile, deleteService);

export default router;
