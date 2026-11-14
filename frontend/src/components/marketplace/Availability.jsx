export default function Availability({ value }) {
  return (
    <span
      className={`market-availability${value === "Full-book" ? " is-full" : ""}`}
    >
      <span aria-hidden="true">●</span> {value}
    </span>
  );
}
