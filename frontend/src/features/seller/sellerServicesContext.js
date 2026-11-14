import { createContext, useContext } from "react";

export const SellerServicesContext = createContext(null);

export function useSellerServices() {
  const value = useContext(SellerServicesContext);
  if (!value) throw new Error("SellerServicesProvider is required inside Seller Center.");
  return value;
}
