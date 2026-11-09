export const DEMO_BOOKING_KEY = "digarsa.dev.booking-fixtures.v1";
export const EDITORIAL_SAMPLE_SERVICE_IDS = Object.freeze([
  "identity",
  "film",
  "digital",
  "direction",
  "editorial",
  "illustration",
]);

// A local, opt-in fixture may route selected editorial samples to a real demo
// Seller Profile. This resolver never creates accounts or grants capabilities.
export function resolveDemoEditorialSeller({
  service,
  development,
  hostname,
  storage,
  accounts,
}) {
  if (
    development !== true ||
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    !EDITORIAL_SAMPLE_SERVICE_IDS.includes(service?.id)
  )
    return null;
  try {
    const row = JSON.parse(storage.getItem(DEMO_BOOKING_KEY) || "null");
    if (
      row?.version !== 1 ||
      typeof row.sellerId !== "string" ||
      typeof row.profileId !== "string" ||
      !Array.isArray(row.editorialServiceIds) ||
      !row.editorialServiceIds.includes(service.id) ||
      row.editorialServiceIds.some(
        (id) => !EDITORIAL_SAMPLE_SERVICE_IDS.includes(id),
      )
    )
      return null;
    const profile = accounts.getBookableSeller(row.profileId);
    if (!profile || profile.ownerUserId !== row.sellerId) return null;
    return { ...profile, demoFixture: true };
  } catch {
    return null;
  }
}
