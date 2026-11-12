import { useEffect, useRef } from "react";
import Button from "../../components/ui/Button";
import "./marketing.css";

export default function MarketingPage({
  title,
  animationKey = "page",
  children,
}) {
  const root = useRef(null);
  useEffect(() => {
    document.title = `${title} — Digarsa`;
    if (!window.location.hash) window.scrollTo(0, 0);
    else
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [title]);
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return undefined;
    // Content is always visible. Enhancement only animates newly encountered panels.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("marketing-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    root.current
      .querySelectorAll("[data-marketing-reveal]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [title, animationKey]);
  return (
    <div className="marketing" ref={root}>
      {children}
    </div>
  );
}

export function MarketingCTA({
  title = "Ide baikmu layak bertemu talenta yang tepat.",
}) {
  return (
    <section className="marketing-cta" data-marketing-reveal>
      <div className="marketing-container">
        <span className="marketing-label">PERTEMUAN BERIKUTNYA</span>
        <h2>{title}</h2>
        <p>Mulai of sebuah ide. Temukan teman untuk mewujudkannya.</p>
        <div className="marketing-actions">
          <Button to="/marketplace" variant="aqua">
            Explore the marketplace <span aria-hidden="true"></span>
          </Button>
          <Button
            to="/become-a-creator"
            variant="secondary"
            className="marketing-button-light"
          >
            Jadi kreator <span aria-hidden="true"></span>
          </Button>
        </div>
        <span className="marketing-cta__sign">Where Ideas Meet Talent.</span>
      </div>
    </section>
  );
}
