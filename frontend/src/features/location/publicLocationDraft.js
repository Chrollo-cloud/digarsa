import { validateCoordinates } from "./locationModel.js";

// Form draft only: no account, buyer location, persistence, or GPS dependency.
export function createPublicLocationDraft(initial, inherit = false) {
  return {
    visibility: initial?.visibility || (inherit ? "inherit" : "hidden"),
    area: initial?.area || "",
    lat: String(initial?.coordinates?.lat ?? ""),
    lng: String(initial?.coordinates?.lng ?? ""),
    confirmed: initial?.confirmed === true,
  };
}

export function publicLocationDraftReducer(state, action) {
  switch (action.type) {
    case "visibility":
      return {
        ...state, visibility: action.value, confirmed: false,
        ...(action.value !== "pin" ? { lat: "", lng: "" } : {}),
        ...(action.value === "hidden" ? { area: "" } : {}),
      };
    case "area":
      return { ...state, area: action.value, confirmed: false };
    case "coordinate":
      return ["lat", "lng"].includes(action.field)
        ? { ...state, [action.field]: action.value, confirmed: false }
        : state;
    case "confirmed":
      return { ...state, confirmed: action.value === true };
    case "confirmPick": {
      const point = validateCoordinates(action.point);
      return {
        ...state, lat: String(point.lat), lng: String(point.lng), confirmed: true,
      };
    }
    default:
      return state;
  }
}
