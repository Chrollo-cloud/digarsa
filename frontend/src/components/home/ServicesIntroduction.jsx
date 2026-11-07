import { Link } from "react-router-dom";

const categories = [
  ["Branding", "Branding"],
  ["Fotografi", "Fotografi & Film"],
  ["Digital", "Web & Digital"],
  ["Ilustrasi", "Illustration & Motion"],
];

export default function ServicesIntroduction() {
  return (
    <>
      <section className="home-services" aria-labelledby="services-title">
        <div className="home-services__row" data-reveal>
          <h2 id="services-title">Layanan</h2>
          <nav aria-label="Kategori kreatif">
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
          Talenta kreatif
          <br />
          untuk ide yang <em>berarti.</em>
        </h2>
        <p data-reveal>
          Temukan partner kreatif lokal yang bisa membantu bisnis dan ide kamu
          tumbuh—dari strategi, visual, hingga pengalaman digital.
        </p>
      </section>
    </>
  );
}
