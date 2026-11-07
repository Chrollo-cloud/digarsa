import { Link } from "react-router-dom";
import { projects } from "../../data/home";
import SectionHeading from "./SectionHeading";

export default function WorkShowcase() {
  return (
    <section className="home-work" aria-labelledby="work-title">
      <SectionHeading
        label="portfolio"
        id="work-title"
        description="Jelajahi hasil kolaborasi kreator Digarsa."
      >
        Karya yang <em>berbicara.</em>
      </SectionHeading>
      <div className="home-work__grid">
        {projects.map((project) => (
          <Link
            key={project.id}
            className="home-work__item"
            to={`/service/${project.id}`}
          >
            <img
              src={project.image}
              alt={project.alt}
              loading="lazy"
              width="1200"
              height="800"
            />
            <div>
              <span className="type-metadata">{project.category}</span>
              <h3>{project.title}</h3>
            </div>
            <span className="home-work__arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
