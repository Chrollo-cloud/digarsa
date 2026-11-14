import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
  getAdminReport,
  getMyReport,
  listAdminReports,
  listMyReports,
  moderateReport,
  submitReport,
} from "./report.controller.js";

const router = Router();

router.post("/reports", authenticate, requireRole("USER"), submitReport);
router.get("/me/reports", authenticate, requireRole("USER"), listMyReports);
router.get("/reports/:report_id", authenticate, requireRole("USER"), getMyReport);
router.get("/admin/reports", authenticate, requireRole("ADMIN"), listAdminReports);
router.get("/admin/reports/:report_id", authenticate, requireRole("ADMIN"), getAdminReport);
router.patch("/admin/reports/:report_id", authenticate, requireRole("ADMIN"), moderateReport);

export default router;
