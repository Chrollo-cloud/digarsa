// Saving a review and delivering a notification are separate durable operations.
// Never tell the user a saved review failed just because a notification failed.
export function createReviewActions({ reviews, messaging }) {
  return {
    submit(input, options) {
      const review = reviews.submit(input, options);
      let notification_error = "";
      try {
        messaging.notifyReviewEvent(review.id);
      } catch {
        notification_error =
          "Ulasan tersimpan. Notifikasi kreator belum dapat dikirim; kamu dapat mencoba lagi.";
      }
      return { review, notification_error };
    },
    update(review_id, input, options) {
      // An edit is not a new review event; never redeliver new_review here.
      return { review: reviews.update(review_id, input, options), notification_error: "" };
    },
    retryNotification(review_id) {
      reviews.getNotificationContext(review_id);
      return messaging.notifyReviewEvent(review_id);
    },
  };
}
