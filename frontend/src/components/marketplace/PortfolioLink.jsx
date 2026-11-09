import { publicUrl } from "../../utils/publicUrl";

export default function PortfolioLink({ url }) {
  const href = publicUrl(url);
  if (!href) return null;
  return (
    <a className="button button--secondary" href={href}
      target="_blank" rel="noopener noreferrer">
      Lihat Portfolio <span aria-hidden="true">↗</span>
      <span className="market-sr-only"> (buka tab baru)</span>
    </a>
  );
}
