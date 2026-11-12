import { Link } from "react-router-dom";

export default function MessagingState({
  error,
  title = "Belum ada percakapan.",
  children,
  showLink = true,
}) {
  return (
    <section className="messaging-empty" role={error ? "alert" : undefined}>
      <span className="messaging-symbol" aria-hidden="true">

      </span>
      <h2>{error ? "Data unavailable." : title}</h2>
      <p>
        {error ||
          children ||
          "Start a conversation about a service that interests you."}
      </p>
      {showLink && (
        <Link to={error ? "/messages" : "/marketplace"}>
          {error ? "Back to inbox" : "Explore the marketplace "}
        </Link>
      )}
      {error && (
        <small>
          Periksa akun, alamat tujuan, atau penyimpanan browser, lalu coba lagi.
        </small>
      )}
    </section>
  );
}
