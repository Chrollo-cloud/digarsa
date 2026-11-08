// One small observable health signal for the existing mutable catalog arrays.
// It contains no catalog records and is not another catalog or account store.
export function createCatalogStatus() {
  let state = { error: "", hasValidCatalog: false, revision: 0 };
  const listeners = new Set();
  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(next) {
      state = { ...next, revision: state.revision + 1 };
      listeners.forEach((listener) => {
        try {
          listener();
        } catch {
          /* Readers cannot undo a completed sync. */
        }
      });
    },
  };
}
export const catalogStatus = createCatalogStatus();

export function createCatalogSync({
  readEntries,
  readProfiles,
  build,
  publish,
  status,
}) {
  return function refresh() {
    try {
      const entries = readEntries();
      if (entries.error) throw new Error(entries.error);
      if (
        !Array.isArray(entries.services) ||
        !Array.isArray(entries.hiddenServiceIds)
      )
        throw new Error("Data katalog tidak lengkap.");
      const profiles = readProfiles();
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      if (
        byId.size !== profiles.length ||
        entries.services.some(
          (row) =>
            !byId.has(row.creatorId) ||
            byId.get(row.creatorId).ownerUserId !== row.ownerUserId,
        )
      )
        throw new Error(
          "Asosiasi layanan dan pemilik Seller Profile belum dapat diverifikasi.",
        );
      // Complete all reads/building before touching the published arrays.
      const overlay = build({
        profiles,
        records: entries.services,
        hiddenServiceIds: entries.hiddenServiceIds,
      });
      publish(overlay);
      status.update({ error: "", hasValidCatalog: true });
      return true;
    } catch (error) {
      status.update({
        error:
          error instanceof TypeError
            ? "Data profil atau layanan katalog tidak lengkap."
            : error.message || "Katalog belum dapat diverifikasi.",
        hasValidCatalog: status.snapshot().hasValidCatalog,
      });
      return false;
    }
  };
}
