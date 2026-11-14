import Button from "../../components/ui/Button";
import MarketingPage, { MarketingCTA } from "./MarketingPage";
import workspace from "../../assets/home/workspace.jpg";
import design from "../../assets/home/design.jpg";

const values = [
  [
    "01",
    "Ruang untuk talenta.",
    "Karya kreatif lokal punya banyak kemungkinan. Kami ingin memberi kreator ruang untuk memperkenalkan keahlian dan services mereka.",
  ],
  [
    "02",
    "Kepercayaan yang dibangun.",
    "Profil, brief yang jelas, dan ulasan of booking yang selesai membantu pelanggan mengenal orang di balik sebuah karya.",
  ],
  [
    "03",
    "Kolaborasi yang dekat.",
    "Percakapan membantu menyamakan harapan. From kebutuhan awal sampai perkembangan orders, setiap pihak punya ruang untuk saling memahami.",
  ],
];

export default function AboutPage() {
  return (
    <MarketingPage title="About Digarsa">
      <header className="marketing-container marketing-about-hero">
        <span className="marketing-label marketing-pill">TENTANG DIGARSA</span>
        <h1>
          Tempat ide menemukan <br />
          <em>teman berkarya.</em>
        </h1>
        <p>
          Digarsa mempertemukan kebutuhan kreatif dengan talenta lokal. Untuk
          ide personal, usaha yang sedang tumbuh, dan karya yang ingin kamu
          mulai.
        </p>
        <figure className="marketing-hero-photo" data-marketing-reveal>
          <img
            src={workspace}
            alt="Ruang kerja dengan meja bersama, tanaman, dan cahaya alami"
            width="1600"
            height="900"
            fetchPriority="high"
          />
          <figcaption>
            <span>RUANG UNTUK KEMUNGKINAN BARU</span>
            <span>Where Ideas Meet Talent.</span>
          </figcaption>
        </figure>
      </header>
      <section
        className="marketing-container marketing-story marketing-section"
        aria-labelledby="story-title"
        data-marketing-reveal
      >
        <div>
          <span className="marketing-label">01 / GAGASAN KAMI</span>
          <h2 id="story-title">
            Ide lokal.
            <br />
            Kemungkinan
            <br />
            <em>yang luas.</em>
          </h2>
        </div>
        <div className="marketing-prose">
          <p className="marketing-lead">
            Sebuah usaha punya cerita. Seorang kreator punya cara untuk
            membuatnya terlihat, terdengar, dan terasa.
          </p>
          <p>
            Small businesses sharing their products, owners seeking a visual identity, and people preparing personal projects all need the right creative partner.
          </p>
          <p>
            Digarsa brings those people together. Explore services, meet creators, and start a conversation about what you want to make. We believe good creative work starts with understanding.
          </p>
          <Button to="/how-it-works" variant="secondary">
            Learn how it works
          </Button>
        </div>
      </section>
      <section className="marketing-mission" aria-labelledby="mission-title">
        <div className="marketing-container marketing-mission__grid">
          <figure data-marketing-reveal>
            <img
              src={design}
              alt="A designer's desk with color palette explorations and visual identity sketches"
              width="1200"
              height="1500"
              loading="lazy"
            />
            <figcaption>Every project starts with exploration.</figcaption>
          </figure>
          <div data-marketing-reveal>
            <span className="marketing-label">02 / OUR DIRECTION</span>
            <h2 id="mission-title">
              Opening space.
              <br />
              <em>Mendekatkan</em>
              <br />
              opportunity.
            </h2>
            <p>
              Helping customers find the skills they need while giving creators room to grow through their work.
            </p>
            <ul className="marketing-values">
              {values.map(([number, title, copy]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section
        className="marketing-container marketing-section"
        aria-labelledby="together-title"
      >
        <div className="marketing-section-heading" data-marketing-reveal>
          <span className="marketing-label">03 / TWO SIDES, ONE SPACE</span>
          <h2 id="together-title">
            There is room for
            <br />
            <em>ide dan keahlianmu.</em>
          </h2>
        </div>
        <div className="marketing-audiences">
          <article data-marketing-reveal>
            <span className="marketing-label">FOR CUSTOMERS</span>
            <h3>
              Meet the person
              <br />
              behind the work.
            </h3>
            <p>
              Compare services, explore portfolios and verified reviews, then send a brief to a creator with an available service. Track requests from the same account.
            </p>
            <Button to="/marketplace" variant="secondary">
              Explore services
            </Button>
          </article>
          <article data-marketing-reveal>
            <span className="marketing-label">FOR CREATORS</span>
            <h3>
              Give your skills
              <br />
              room to be discovered.
            </h3>
            <p>
              Activate a Seller Profile on your Digarsa account, introduce your skills, and publish services. Manage requests and conversations in Seller Center while remaining a customer too.
            </p>
            <Button to="/become-a-creator" variant="secondary">
              Become a creator
            </Button>
          </article>
        </div>
        <p className="marketing-demo-note">
          Digarsa is currently a local demo. Account data and activity are stored in this browser; payments and cross-device sync are not available. Photos illustrate creative workspaces.
        </p>
      </section>
      <MarketingCTA />
    </MarketingPage>
  );
}
