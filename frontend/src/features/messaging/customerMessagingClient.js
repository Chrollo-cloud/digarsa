import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { services } from "../../data/marketplace";
import { messagingStore } from "./messagingClient";
import { createCustomerMessaging } from "./customerMessaging";

export const customerMessaging = createCustomerMessaging({
  messaging: messagingStore,
  accounts: demoStore,
  customers: customerStore,
  getServices: () => services,
});
