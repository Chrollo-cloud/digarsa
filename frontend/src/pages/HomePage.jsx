import { useEffect, useRef } from "react";
import HeroSection from "../components/home/HeroSection";
import ServicesIntroduction from "../components/home/ServicesIntroduction";
import PortfolioRail from "../components/home/PortfolioRail";
import EditorialSection from "../components/home/EditorialSection";
import Marquee from "../components/home/Marquee";
import WorkShowcase from "../components/home/WorkShowcase";
import FeaturedCreators from "../components/home/FeaturedCreators";
import ClosingCTA from "../components/home/ClosingCTA";
import "./home.css";

export default function HomePage() {
  const root = useRef(null);

  useEffect(() => {
    document.title = "Digarsa — Where Ideas Meet Talent.";
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !("IntersectionObserver" in window))
      return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) {
            target.classList.remove("reveal-pending");
            observer.unobserve(target);
          }
        });
      },
      { threshold: 0.08 },
    );
    const elements = root.current.querySelectorAll("[data-reveal]");
    elements.forEach((element) => {
      element.classList.add("reveal-pending");
      observer.observe(element);
    });
    function revealAll() {
      if (preference.matches)
        elements.forEach((element) =>
          element.classList.remove("reveal-pending"),
        );
    }
    preference.addEventListener("change", revealAll);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", revealAll);
    };
  }, []);

  return (
    <div className="home" ref={root}>
      <HeroSection />
      <ServicesIntroduction />
      <PortfolioRail />
      <EditorialSection />
      <Marquee />
      <WorkShowcase />
      <FeaturedCreators />
      <ClosingCTA />
    </div>
  );
}
