import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.controller.js";

const router = Router();

router.get("/me/notifications/unread-count", authenticate, getUnreadNotificationCount);
router.patch("/me/notifications/read-all", authenticate, markAllNotificationsRead);
router.get("/me/notifications", authenticate, listMyNotifications);
router.patch("/me/notifications/:notification_id/read", authenticate, markNotificationRead);

export default router;
