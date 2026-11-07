import { creators } from "../../data/home";
import CreatorFlipCard from "./CreatorFlipCard";
import SectionHeading from "./SectionHeading";

export default function FeaturedCreators() {
  return (
    <section className="home-creators" aria-labelledby="creators-title">
      <SectionHeading
        label="creators"
        id="creators-title"
        description="Temukan cerita dan sudut pandang di balik setiap kreator."
      >
        Temui para <em>kreator.</em>
      </SectionHeading>
      <div className="home-creators__grid">
        {creators.map((creator, index) => (
          <CreatorFlipCard key={creator.id} creator={creator} index={index} />
        ))}
      </div>
      <p className="home-creators__hint type-metadata">
        HOVER · ENTER / SPACE · TAP TO FLIP ↗
      </p>
    </section>
  );
}
