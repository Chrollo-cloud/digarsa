// Public links and images must not turn stored demo text into executable URLs.
export function publicUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048)
    return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
