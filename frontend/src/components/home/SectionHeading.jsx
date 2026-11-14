export default function SectionHeading({ label, children, description, id }) {
  return (
    <div className="home-heading" data-reveal>
      <span className="home-label">/{label}</span>
      <h2 id={id}>{children}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}
