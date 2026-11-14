import { useState } from "react";
import { useLocalImage } from "../media/useLocalImage";

export default function Avatar({ user, className = "" }) {
  return <AvatarImage key={`${user.id}-${user.avatarUrl}-${user.avatarMediaId}`} user={user} className={className} />;
}
function AvatarImage({ user, className }) {
  const [failed, setFailed] = useState(false);
  const src = useLocalImage({ url: user.avatarUrl, mediaId: user.avatarMediaId, ownerUserId: user.id, scope: "account" });
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("id");
  return (
    <div className={`personal-avatar ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={`Foto profil ${user.name}`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span role="img" aria-label={`Inisial ${user.name}`}>
          {initials}
        </span>
      )}
    </div>
  );
}
