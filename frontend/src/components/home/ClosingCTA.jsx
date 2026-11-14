import Button from "../ui/Button";

export default function ClosingCTA() {
  return (
    <section className="home-closing" aria-labelledby="closing-title">
      <span className="home-label">/collaborate</span>
      <h2 id="closing-title" data-reveal>
        Your ideas
        <br />
        deserve to <em>become reality.</em>
      </h2>
      <Button variant="aqua" to="/marketplace">
        Find creative talent
      </Button>
    </section>
  );
}
