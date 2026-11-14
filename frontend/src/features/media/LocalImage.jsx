import { useState } from "react";
import { useLocalImage } from "./useLocalImage";
export default function LocalImage({ mediaId, ownerUserId, url, alt, scope = "seller", ...props }) {
  const src = useLocalImage({ mediaId, ownerUserId, url, scope });
  const [failed, setFailed] = useState("");
  return src && failed !== src ? <img {...props} src={src} alt={alt} onError={() => setFailed(src)} /> : <span {...props} role="img" aria-label={alt}>◉</span>;
}
