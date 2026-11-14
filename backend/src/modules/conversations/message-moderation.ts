/** Deterministic, local-only safety classification for conversation messages. */
export type MessageFlagSeverity = "LOW" | "MEDIUM" | "HIGH";

export type MessageFlagReason =
  | "OFF_PLATFORM_PAYMENT_REQUEST"
  | "SUSPICIOUS_LINK"
  | "PHISHING_ATTEMPT"
  | "CREDENTIAL_REQUEST";

export interface MessageModerationResult {
  flagged: boolean;
  reasons: MessageFlagReason[];
  severity: MessageFlagSeverity | null;
}

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "rb.gy",
  "cutt.ly",
  "goo.su",
]);

function normalize(content: string): string {
  return content
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .toLowerCase();
}

function hasOffPlatformPaymentRequest(text: string): boolean {
  const paymentAction =
    /\b(?:pay|transfer|send|wire|settle|bayar|transferkan|kirim(?:kan)?|lunasi)\b/u.test(text);
  const paymentMethod =
    /\b(?:payment|pembayaran|money|uang|fee|biaya|deposit|dp|down payment|invoice|tagihan)\b/u.test(text);
  const explicitBypass =
    /\b(?:outside (?:the )?platform|off[- ]platform|outside digarsa|di luar platform|di luar digarsa|langsung ke saya|pay me directly|transfer langsung ke saya)\b/u.test(text);
  const personalDestination =
    /\b(?:my personal (?:bank )?account|personal bank account|rekening pribadi|akun pribadi|dompet pribadi)\b/u.test(text);

  return paymentAction && paymentMethod && (explicitBypass || personalDestination);
}

function requestsCredentials(text: string): boolean {
  const asksForSecret =
    /\b(?:send|share|tell|give|provide|confirm|verify|masukkan|kirim|berikan|bagikan|sebutkan)\b.{0,48}\b(?:password|passcode|otp|one[- ]time code|verification code|kode verifikasi|kata sandi|pin)\b/u.test(text) ||
    /\b(?:password|passcode|otp|one[- ]time code|verification code|kode verifikasi|kata sandi|pin)\b.{0,48}\b(?:send|share|tell|give|provide|confirm|verify|masukkan|kirim|berikan|bagikan|sebutkan)\b/u.test(text);

  const quotedOrProtectiveContext =
    /\b(?:never|don't|do not|dont|jangan|tidak pernah)\b.{0,48}\b(?:send|share|tell|give|provide|masukkan|kirim|berikan|bagikan)\b.{0,48}\b(?:password|passcode|otp|one[- ]time code|verification code|kode verifikasi|kata sandi|pin)\b/u.test(text);
  return asksForSecret && !quotedOrProtectiveContext;
}

function isSuspiciousUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl);
    const hostname = url.hostname.toLowerCase();
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
    const hasPunycode = hostname.split(".").some((part) => part.startsWith("xn--"));
    const hasEmbeddedCredentials = Boolean(url.username || url.password);
    return (
      SHORTENER_HOSTS.has(hostname) ||
      isIpAddress ||
      hasPunycode ||
      hasEmbeddedCredentials
    );
  } catch {
    return true;
  }
}

function hasPhishingSignals(text: string): boolean {
  const impersonationOrThreat =
    /\b(?:account|akun|payment|pembayaran|order|pesanan|seller|admin|support|dukungan)\b.{0,48}\b(?:suspended|blocked|locked|expired|failed|ditangguhkan|diblokir|terkunci|kedaluwarsa|gagal)\b/u.test(text) ||
    /\b(?:suspended|blocked|locked|expired|failed|ditangguhkan|diblokir|terkunci|kedaluwarsa|gagal)\b.{0,48}\b(?:account|akun|payment|pembayaran|order|pesanan|seller|admin|support|dukungan)\b/u.test(text);
  const credentialOrPaymentAction =
    /\b(?:click|open|visit|login|log in|sign in|verify|confirm|update|klik|buka|kunjungi|masuk|verifikasi|konfirmasi|perbarui)\b/u.test(text);
  const urgency =
    /\b(?:immediately|urgent|within \d+ hours?|right now|segera|secepatnya|dalam \d+ jam|sekarang juga)\b/u.test(text);

  return impersonationOrThreat && (credentialOrPaymentAction || urgency);
}

/** Classifies message text without network, Express, database, or model access. */
export function classifyMessage(content: string): MessageModerationResult {
  const text = normalize(content);
  const reasons: MessageFlagReason[] = [];
  const suspiciousUrl = [...content.matchAll(URL_PATTERN)].some(([url]) =>
    isSuspiciousUrl(url.replace(/[),.!?]+$/u, "")),
  );

  if (hasOffPlatformPaymentRequest(text)) {
    reasons.push("OFF_PLATFORM_PAYMENT_REQUEST");
  }
  if (suspiciousUrl) {
    reasons.push("SUSPICIOUS_LINK");
  }
  if (hasPhishingSignals(text)) {
    reasons.push("PHISHING_ATTEMPT");
  }
  if (requestsCredentials(text)) {
    reasons.push("CREDENTIAL_REQUEST");
  }

  const severity: MessageFlagSeverity | null = reasons.includes("CREDENTIAL_REQUEST") || reasons.includes("PHISHING_ATTEMPT")
    ? "HIGH"
    : reasons.includes("OFF_PLATFORM_PAYMENT_REQUEST")
      ? "MEDIUM"
      : reasons.includes("SUSPICIOUS_LINK")
        ? "LOW"
        : null;

  return { flagged: reasons.length > 0, reasons, severity };
}

/** Whitelist only safe moderation metadata for authorized conversation participants. */
export function safeModerationMetadata(result: MessageModerationResult) {
  return {
    flagged: result.flagged,
    reasons: [...result.reasons],
    severity: result.severity,
  };
}
