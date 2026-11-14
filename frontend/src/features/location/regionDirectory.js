const BASE_URL = "https://www.emsifa.com/api-wilayah-indonesia/v2";
const memory = new Map();
const allowedLevels = new Set(["provinces", "regencies", "districts", "villages"]);

export async function getRegionOptions(level, parentId = "", fetchImpl = globalThis.fetch) {
  if (!allowedLevels.has(level) || (level !== "provinces" && !parentId))
    throw new Error("Choose the parent region first.");
  const cacheKey = `digarsa.region-directory.v2:${level}:${parentId || "all"}`;
  if (memory.has(cacheKey)) return memory.get(cacheKey);

  let persisted = null;
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(cacheKey) || "null");
    if (Array.isArray(value) && value.every((row) => row?.id && row?.name)) persisted = value;
  } catch {
    // Browser storage is optional; the directory remains usable through the public static source.
  }
  if (!fetchImpl) {
    if (persisted) return persisted;
    throw new Error("The region directory is unavailable. Check your connection and try again.");
  }

  const suffix = level === "provinces" ? "provinces" : `${level}/${encodeURIComponent(parentId)}`;
  try {
    const response = await fetchImpl(`${BASE_URL}/${suffix}.json`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("The region directory could not be loaded.");
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : null;
    if (!rows || !rows.every((row) => typeof row?.id === "string" && typeof row?.name === "string"))
      throw new Error("The region directory returned invalid data.");
    const options = rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(level === "villages" && typeof row.postal_code === "string"
        ? { postalCode: row.postal_code }
        : {}),
    }));
    memory.set(cacheKey, options);
    try { globalThis.localStorage?.setItem(cacheKey, JSON.stringify(options)); } catch { /* Cache is optional. */ }
    return options;
  } catch (error) {
    if (persisted) {
      memory.set(cacheKey, persisted);
      return persisted;
    }
    throw error instanceof Error ? error : new Error("The region directory is unavailable.");
  }
}
