import Button from "../ui/Button";

export default function ClosingCTA() {
  return (
    <section className="home-closing" aria-labelledby="closing-title">
      <span className="home-label">/collaborate</span>
      <h2 id="closing-title" data-reveal>
        Ide kamu
        <br />
        layak <em>jadi karya.</em>
      </h2>
      <Button variant="aqua" to="/marketplace">
        Temukan talent <span aria-hidden="true">↗</span>
      </Button>
    </section>
  );
}
