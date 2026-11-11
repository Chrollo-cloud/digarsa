import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  getCatalogFacets,
  getPublicCreator,
  getPublicService,
  listPublicServices,
} from "./catalog.controller.js";
import {
  addCartItem,
  addFavorite,
  listCart,
  listFavorites,
  removeCartItem,
  removeFavorite,
} from "./saved.controller.js";

const router = Router();

router.get("/services", listPublicServices);
router.get("/services/:service_id", getPublicService);
router.get("/creators/:seller_profile_id", getPublicCreator);
router.get("/catalog/facets", getCatalogFacets);
router.get("/me/favorites", authenticate, listFavorites);
router.put("/me/favorites/:service_id", authenticate, addFavorite);
router.delete("/me/favorites/:service_id", authenticate, removeFavorite);
router.get("/me/cart", authenticate, listCart);
router.put("/me/cart/:service_id", authenticate, addCartItem);
router.delete("/me/cart/:service_id", authenticate, removeCartItem);

export default router;