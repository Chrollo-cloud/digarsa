import { useState } from "react";
import { Link } from "react-router-dom";
import MarketingPage, { MarketingCTA } from "./MarketingPage";
import ProcessIllustration from "./ProcessIllustration";
import { processSteps } from "./processSteps";
import digital from "../../assets/home/digital.jpg";

export default function HowItWorksPage() {
  const [audience, setAudience] = useState("customer");
  const creator = audience === "creator";
  return (
    <MarketingPage title="How It Works" animationKey={audience}>
      <header className="marketing-container marketing-how-hero">
        <div>
          <span className="marketing-label marketing-pill">
            HOW DIGARSA WORKS
          </span>
          <h1>
            Small steps.
            <br />
            <em>Meaningful work.</em>
          </h1>
          <p>
            From finding talent to building collaborations. Learn the steps and start bringing your own idea to life.
          </p>
          <a className="marketing-text-link" href="#langkah">
            Explore the steps <span aria-hidden="true">↓</span>
          </a>
        </div>
        <ProcessIllustration />
      </header>
      <div className="marketing-how-band">
        <div className="marketing-container">
          <span>GOOD IDEAS</span>
          <span aria-hidden="true">✳</span>
          <span>THE RIGHT CONNECTIONS</span>
          <span aria-hidden="true"></span>
          <span>MEANINGFUL WORK</span>
        </div>
      </div>
      <section
        id="langkah"
        className="marketing-container marketing-section marketing-process"
        aria-labelledby="process-title"
      >
        <div className="marketing-process__intro">
          <span className="marketing-label">PILIH SISI CERITAMU</span>
          <h2 id="process-title">
            Bagaimana kamu
            <br />
            ingin <em>mulai?</em>
          </h2>
          <p>
            Satu akun, dua kemungkinan. Search bantuan kreatif atau tawarkan
            keahlianmu melalui Seller Profile.
          </p>
          <div
            className="marketing-switch"
            role="group"
            aria-label="Pilih panduan Digarsa"
          >
            {[
              ["customer", "Sebagai Customer"],
              ["creator", "Sebagai Creator"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={audience === value}
                aria-controls="process-steps"
                onClick={() => setAudience(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="marketing-process__status" role="status">
            6 langkah {creator ? "sebagai kreator" : "sebagai customer"}.
          </p>
          <figure className="marketing-process__photo">
            <img
              src={digital}
              alt="Meja kerja kreatif dengan laptop, sketsa, dan perlengkapan desain"
              width="1200"
              height="1500"
              loading="lazy"
            />
            <figcaption>Mulai of satu percakapan yang baik.</figcaption>
          </figure>
        </div>
        <ol
          className="marketing-steps"
          id="process-steps"
          aria-label={
            creator ? "Langkah sebagai kreator" : "Langkah sebagai customer"
          }
          key={audience}
        >
          {processSteps[audience].map((step, index) => (
            <li key={step.title} data-marketing-reveal>
              <span className="marketing-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="marketing-label">
                  {creator ? "RUANG KREATOR" : "PERJALANAN PELANGGAN"}
                </span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <Link className="marketing-text-link" to={step.to}>
                  {step.link} <span aria-hidden="true"></span>
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <aside
        className="marketing-container marketing-process-note"
        aria-labelledby="demo-title"
      >
        <span className="marketing-label">BEFORE YOU BEGIN</span>
        <h2 id="demo-title">About this demo.</h2>
        <p>
          Accounts, conversations, and activity are stored locally in this browser. Payments, escrow, and cross-device sync are not available. Accepted requests are not automatically paid or completed.
        </p>
        <p>
          Verified reviews come only from completed bookings. This explains what you can test in the demo.
        </p>
      </aside>
      <MarketingCTA title="Now, bring your idea." />
    </MarketingPage>
  );
}
