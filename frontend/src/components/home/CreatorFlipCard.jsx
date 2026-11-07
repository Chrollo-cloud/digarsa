import { useState } from "react";
import { Link } from "react-router-dom";

export default function CreatorFlipCard({ creator, index }) {
  const [flipped, setFlipped] = useState(false);
  const [pinned, setPinned] = useState(false);

  function toggle() {
    setFlipped(!flipped);
    setPinned(!flipped);
  }

  function leave(event) {
    if (!pinned && !event.currentTarget.contains(document.activeElement))
      setFlipped(false);
  }

  return (
    <article
      className={`creator-card${flipped ? " is-flipped" : ""}`}
      onMouseEnter={() => {
        if (window.matchMedia("(hover: hover)").matches) setFlipped(true);
      }}
      onMouseLeave={leave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFlipped(false);
          setPinned(false);
        }
      }}
    >
      <button
        className="creator-card__toggle"
        type="button"
        aria-expanded={flipped}
        aria-controls={`creator-${creator.id}`}
        onClick={toggle}
      >
        {flipped ? "Balik" : `Lihat detail ${creator.name}`}{" "}
        <span aria-hidden="true">{flipped ? "↶" : "↗"}</span>
      </button>
      <div className="creator-card__inner">
        <div
          className="creator-card__face creator-card__front"
          aria-hidden={flipped}
        >
          <img
            src={creator.image}
            alt=""
            loading="lazy"
            width="600"
            height="880"
          />
          <span className="creator-card__index type-metadata">
            CREATOR / 0{index + 1}
          </span>
          <div className="creator-card__front-copy">
            <span>{creator.role}</span>
            <h3>{creator.name}</h3>
            <p>{creator.city}</p>
          </div>
        </div>
        <div
          className="creator-card__face creator-card__back"
          id={`creator-${creator.id}`}
          inert={!flipped}
          aria-hidden={!flipped}
        >
          <span className="type-metadata">CREATIVE PARTNER</span>
          <h3>{creator.name}</h3>
          <p>{creator.description}</p>
          <span className="creator-card__city">↗ {creator.city}</span>
          <ul>
            {creator.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
          <Link
            to={`/seller/${creator.id}`}
            aria-label={`Lihat profil ${creator.name}`}
          >
            Lihat profil <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
