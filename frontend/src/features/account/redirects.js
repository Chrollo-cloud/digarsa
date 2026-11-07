const destinations =
  /^(?:\/(?:dashboard|profile|settings|saved|favorites|cart|orders|messages|become-a-creator|seller-dashboard|admin|marketplace|about|how-it-works)?|\/(?:service|seller|booking|orders)\/[a-zA-Z0-9-]+)$/;

export function safeReturnTo(value, fallback = "/dashboard") {
  if (
    typeof value !== "string" ||
    /[\\\s]/.test(value) ||
    value.split(/[?#]/, 1)[0].includes("%") ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return fallback;
  try {
    const url = new URL(value, "https://digarsa.invalid");
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      url.origin !== "https://digarsa.invalid" ||
      !destinations.test(url.pathname)
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
