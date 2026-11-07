import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../ui/Button";
import { railProjects } from "../../data/home";

export default function PortfolioRail() {
  const rail = useRef(null);
  const [position, setPosition] = useState(0);

  function updatePosition() {
    const node = rail.current;
    const range = node.scrollWidth - node.clientWidth;
    setPosition(range > 0 ? node.scrollLeft / range : 0);
  }

  function move(direction) {
    const node = rail.current;
    node.scrollBy({
      left: direction * Math.max(node.clientWidth * 0.7, 260),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <section className="home-portfolio" aria-label="Portfolio pilihan">
      <div className="home-portfolio__head home-label" data-reveal>
        <span>/portfolio</span>
        <span>GESER UNTUK MENJELAJAHI</span>
      </div>
      <div
        className="home-rail"
        ref={rail}
        onScroll={updatePosition}
        id="portfolio-rail"
        tabIndex={0}
        role="region"
        aria-label="Karya kreator, gulir horizontal"
      >
        {railProjects.map((project) => (
          <Link
            className="home-rail__card"
            to={`/marketplace?project=${project.id}`}
            key={project.id}
          >
            <img
              src={project.image}
              alt={project.alt}
              loading="lazy"
              width="480"
              height="600"
            />
            <div>
              <h3>{project.title}</h3>
              <p>
                {project.category} · {project.studio}
              </p>
              <strong>{project.price}</strong>
            </div>
          </Link>
        ))}
      </div>
      <div className="home-portfolio__controls">
        <Button variant="aqua" to="/marketplace">
          Lihat semua karya <span aria-hidden="true">↗</span>
        </Button>
        <span className="home-portfolio__progress" aria-hidden="true">
          <i style={{ left: `${position * 72}%` }} />
        </span>
        <button
          type="button"
          aria-label="Portfolio sebelumnya"
          aria-controls="portfolio-rail"
          onClick={() => move(-1)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Portfolio berikutnya"
          aria-controls="portfolio-rail"
          onClick={() => move(1)}
        >
          →
        </button>
      </div>
    </section>
  );
}
