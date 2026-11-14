import { useState } from "react";

export default function Marquee() {
  const [paused, setPaused] = useState(false);
  return (
    <section className="home-marquee" aria-label="Idea, talent, karya">
      <div
        className={`home-marquee__track${paused ? " is-paused" : ""}`}
        aria-hidden="true"
      >
        {[0, 1].map((group) => (
          <div className="home-marquee__group" key={group}>
            {[0, 1, 2, 3].map((item) => (
              <span key={item}>IDEA · TALENT · KARYA ·</span>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="home-marquee__pause"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? "Putar teks" : "Jeda teks"}
      </button>
    </section>
  );
}
