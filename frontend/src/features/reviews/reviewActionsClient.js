import { reviewStore } from "./reviewClient";
import { messagingStore } from "../messaging/messagingClient";
import { createReviewActions } from "./reviewActions";

export const reviewActions = createReviewActions({
  reviews: reviewStore,
  messaging: messagingStore,
});
