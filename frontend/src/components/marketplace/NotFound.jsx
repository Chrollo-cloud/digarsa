import Button from "../ui/Button";

export default function NotFound({ type }) {
  return (
    <div className="market-page market-shell market-not-found">
      <span className="market-kicker">404 / DIGARSA</span>
      <h1>{type} not found.</h1>
      <p>
        This address is unavailable. Discover more creative services in the
        marketplace.
      </p>
      <Button to="/marketplace">Back to marketplace </Button>
    </div>
  );
}
