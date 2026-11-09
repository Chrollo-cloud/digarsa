import { useEffect, useState } from "react";
import { publicUrl } from "../../utils/publicUrl";
import { mediaStore } from "./mediaStore";
export function useLocalImage({ url, mediaId, ownerUserId, scope, onError }) {
  const [loaded, setLoaded] = useState(null);
  const key = `${ownerUserId}:${scope}:${mediaId}`;
  useEffect(() => {
    if (!import.meta.env.DEV || !mediaId || !ownerUserId) return;
    let active = true, objectUrl;
    mediaStore.get(mediaId, ownerUserId, scope).then(blob => {
      if (active && blob) {
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ key, src: objectUrl });
      } else if (active) onError?.("Foto lokal tidak ditemukan untuk profil ini pada perangkat ini. Pilih foto lagi atau hapus referensinya.");
    }).catch(() => { if (active) onError?.("Foto lokal belum dapat dibaca. Periksa izin penyimpanan browser atau pilih foto lagi."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, mediaId, ownerUserId, scope, onError]);
  return loaded?.key === key ? loaded.src : publicUrl(url);
}
