const destinations = [
  /^\/(?:dashboard|profile|settings|saved|favorites|cart|orders|reviews|messages|notifications|become-a-creator|marketplace|about|how-it-works)?\/?$/,
  /^\/review\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/?$/,
  /^\/messages\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/?$/,
  /^\/(?:service|seller|booking|orders)\/[a-zA-Z0-9][a-zA-Z0-9-]*\/?$/,
  /^\/seller-dashboard(?:\/(?:profile|earnings|availability|notifications|messages(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]*)?|orders(?:\/[a-zA-Z0-9][a-zA-Z0-9-]*)?|services(?:\/new|\/[a-zA-Z0-9][a-zA-Z0-9-]*\/edit)?))?\/?$/,
  /^\/admin(?:\/(?:accounts|moderation|orders))?\/?$/,
];

// Syntax validation only: RequireAccount/RequireSeller/RequireAdmin still enforce
// permissions at the destination. Never normalize an unsafe path into an allowed one.
export function safeReturnTo(value, fallback = "/") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/.test(value)
  )
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      [...decoded].some(
        (char) =>
          char.charCodeAt(0) < 32 ||
          char.charCodeAt(0) === 127 ||
          char === "\\",
      )
    )
      return fallback;
    const pathname = value.split(/[?#]/, 1)[0];
    if (pathname.includes("%")) return fallback;
    const url = new URL(value, "https://digarsa.invalid");
    if (
      url.origin !== "https://digarsa.invalid" ||
      url.pathname !== pathname ||
      !destinations.some((pattern) => pattern.test(pathname))
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
