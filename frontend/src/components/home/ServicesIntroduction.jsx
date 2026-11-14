import { Link } from "react-router-dom";

const categories = [
  ["Branding", "Branding"],
  ["Photography", "Photography & Film"],
  ["Digital", "Web & Digital"],
  ["Illustration", "Illustration & Motion"],
];

export default function ServicesIntroduction() {
  return (
    <>
      <section className="home-services" aria-labelledby="services-title">
        <div className="home-services__row" data-reveal>
          <h2 id="services-title">Service</h2>
          <nav aria-label="Creative categories">
            {categories.map(([label, category]) => (
              <Link
                key={label}
                to={`/marketplace?category=${encodeURIComponent(category)}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <section className="home-description" aria-labelledby="description-title">
        <h2 id="description-title" data-reveal>
          Creative talent
          <br />
          for ideas that <em>matter.</em>
        </h2>
        <p data-reveal>
          Find local creative partners who can help your business and ideas grow—from strategy and visuals to digital experiences.
        </p>
      </section>
    </>
  );
}
