import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { services } from "../../data/marketplace";
import { messagingStore } from "../messaging/messagingClient";
import { createSellerMessaging } from "./sellerMessaging";

// Role-scoped API facade bound to the app's one shared messaging singleton.
export const sellerMessaging = createSellerMessaging({
  messaging: messagingStore,
  accounts: demoStore,
  customers: customerStore,
  getServices: () => services,
});
