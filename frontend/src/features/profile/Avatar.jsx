import { useState } from "react";

export default function Avatar({ user }) {
  return <AvatarImage key={`${user.id}-${user.avatarUrl}`} user={user} />;
}
function AvatarImage({ user }) {
  const [failed, setFailed] = useState(false);
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("id");
  return (
    <div className="personal-avatar">
      {user.avatarUrl && !failed ? (
        <img
          src={user.avatarUrl}
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
