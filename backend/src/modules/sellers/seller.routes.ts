import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  createSellerProfile,
  getMySellerProfile,
  updateMySellerProfile,
} from "./seller.controller.js";

const router = Router();

router.post(
  "/me",
  authenticate,
  createSellerProfile,
);

router.get(
  "/me",
  authenticate,
  getMySellerProfile,
);

router.patch(
  "/me",
  authenticate,
  updateMySellerProfile,
);

export default router;