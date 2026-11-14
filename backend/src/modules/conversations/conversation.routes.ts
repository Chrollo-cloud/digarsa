import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
  createServiceConversation,
  listConversationMessages,
  listMyConversations,
  sendConversationMessage,
} from "./conversation.controller.js";

const router = Router();

router.post("/services/:service_id/conversations", authenticate, requireRole("USER"), createServiceConversation);
router.get("/me/conversations", authenticate, listMyConversations);
router.get("/conversations/:conversation_id/messages", authenticate, listConversationMessages);
router.post("/conversations/:conversation_id/messages", authenticate, sendConversationMessage);

export default router;
