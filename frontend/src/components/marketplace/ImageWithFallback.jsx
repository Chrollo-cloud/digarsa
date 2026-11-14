import { useState } from "react";

export default function ImageWithFallback({ src, alt = "", fallback, className, loading = "lazy" }) {
  const [failedSrc, setFailedSrc] = useState("");
  if (!src || failedSrc === src) return fallback;
  return <img className={className} src={src} alt={alt} loading={loading} onError={() => setFailedSrc(src)} />;
}
