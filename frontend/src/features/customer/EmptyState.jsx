import { Link } from "react-router-dom";
export default function EmptyState({
  title,
  children,
  to = "/marketplace",
  label = "Jelajahi marketplace",
}) {
  return (
    <div className="customer-empty">
      <h2>{title}</h2>
      <p>{children}</p>
      <Link to={to}>{label} ↗</Link>
    </div>
  );
}
