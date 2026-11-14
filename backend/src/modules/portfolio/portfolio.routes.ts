import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { requireSellerProfile } from "../services/service.middleware.js";
import { createPortfolioItem, deletePortfolioItem, listMyPortfolio, updatePortfolioItem } from "./portfolio.controller.js";

const router = Router();

router.get("/", authenticate, requireRole("USER"), requireSellerProfile, listMyPortfolio);
router.post("/", authenticate, requireRole("USER"), requireSellerProfile, createPortfolioItem);
router.patch("/:item_id", authenticate, requireRole("USER"), requireSellerProfile, updatePortfolioItem);
router.delete("/:item_id", authenticate, requireRole("USER"), requireSellerProfile, deletePortfolioItem);

export default router;
