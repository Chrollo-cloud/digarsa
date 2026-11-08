import { useId, useState } from "react";
import { aggregateBookingTrend } from "./sellerAnalytics";

export default function BookingTrend({ bookings }) {
  const [period, setPeriod] = useState("week");
  const titleId = useId();
  const series = aggregateBookingTrend(bookings, period);
  const total = series.reduce((sum, row) => sum + row.count, 0);
  const maximum = Math.max(
    4,
    Math.ceil(Math.max(0, ...series.map((row) => row.count)) / 4) * 4,
  );
  const label = (row) =>
    new Date(row.date).toLocaleDateString(
      "id-ID",
      period === "year"
        ? { month: "short", year: "2-digit" }
        : { day: "numeric", month: "short" },
    );
  const x = (index) => 48 + (index * 680) / (series.length - 1);
  const y = (count) => 224 - (count / maximum) * 172;
  const points = series
    .map((row, index) => `${x(index)},${y(row.count)}`)
    .join(" ");
  return (
    <section className="ws-section seller-trend" aria-labelledby={titleId}>
      <header>
        <div>
          <span className="ws-kicker">ANALITIK BOOKING</span>
          <h2 id={titleId}>Ruang untuk bertumbuh.</h2>
          <p>Permintaan masuk berdasarkan tanggal pengajuan.</p>
        </div>
        <div
          className="seller-period"
          role="group"
          aria-label="Periode grafik booking"
        >
          {[
            ["week", "7 hari"],
            ["month", "30 hari"],
            ["year", "12 bulan"],
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {text}
            </button>
          ))}
        </div>
      </header>
      <div className="seller-trend__summary" aria-live="polite">
        <strong>{total}</strong>
        <span>permintaan dalam periode ini</span>
        <small>Semua status · bukan nilai pembayaran</small>
      </div>
      {total ? (
        <>
          <svg
            className="seller-trend__chart"
            viewBox="0 0 760 270"
            role="img"
            aria-label={`Grafik ${total} permintaan booking. Data rinci tersedia di bawah.`}
          >
            <title>
              Jumlah permintaan booking berdasarkan tanggal pengajuan
            </title>
            {[0, 1, 2, 3, 4].map((step) => (
              <g key={step}>
                <line
                  x1="48"
                  x2="728"
                  y1={y((maximum * step) / 4)}
                  y2={y((maximum * step) / 4)}
                  stroke="#e8ebef"
                />
                <text x="32" y={y((maximum * step) / 4) + 4} textAnchor="end">
                  {Number(((maximum * step) / 4).toFixed(2))}
                </text>
              </g>
            ))}
            <polygon
              points={`48,224 ${points} 728,224`}
              fill="#7CD5C7"
              opacity=".17"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#118AB2"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {series.map((row, index) => (
              <g key={row.key}>
                <circle cx={x(index)} cy={y(row.count)} r="3.5" fill="#118AB2">
                  <title>
                    {label(row)}: {row.count} permintaan
                  </title>
                </circle>
                {(index === 0 ||
                  index === series.length - 1 ||
                  index % Math.ceil(series.length / 5) === 0) && (
                  <text x={x(index)} y="251" textAnchor="middle">
                    {label(row)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <details className="seller-trend__data">
            <summary>Lihat data grafik</summary>
            <div
              className="ws-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Data tren booking"
            >
              <table className="ws-table">
                <thead>
                  <tr>
                    <th scope="col">Tanggal pengajuan</th>
                    <th scope="col">Jumlah permintaan</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.key}>
                      <td>{label(row)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="seller-trend__empty">
          <span aria-hidden="true">↗</span>
          <h3>Belum ada permintaan pada periode ini.</h3>
          <p>
            Grafik akan terbentuk dari booking layananmu. Coba periode lain
            untuk melihat data sebelumnya.
          </p>
        </div>
      )}
      <p className="ws-note">
        Tanggal mengikuti zona waktu browser. Grafik menghitung pengajuan, bukan
        riwayat perubahan status atau transaksi.
      </p>
    </section>
  );
}
