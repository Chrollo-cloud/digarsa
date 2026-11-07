import Button from "../ui/Button";
import workspace from "../../assets/home/workspace.jpg";

export default function HeroSection() {
  return (
    <section className="home-hero" aria-labelledby="hero-title">
      <img
        className="home-hero__image"
        src={workspace}
        alt=""
        fetchPriority="high"
      />
      <div className="home-hero__copy">
        <p className="home-label">DIGARSA DIGITAL CREATIVE MARKETPLACE</p>
        <h1 id="hero-title">
          Ideas <em>meet</em>
          <br />
          talent.
        </h1>
        <p className="home-hero__tagline">Where Ideas Meet Talent.</p>
        <Button variant="aqua" to="/marketplace">
          Jelajahi kreator <span aria-hidden="true">→</span>
        </Button>
      </div>
      <span className="home-hero__asterisk" aria-hidden="true">
        ✳
      </span>
      <svg
        className="home-hero__wave"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 50 Q90 10 180 50 T360 50 T540 50 T720 50 T900 50 T1080 50 T1260 50 T1440 50 V100 H0Z" />
      </svg>
    </section>
  );
}
