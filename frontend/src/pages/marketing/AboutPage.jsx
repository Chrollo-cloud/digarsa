import Button from "../../components/ui/Button";
import MarketingPage, { MarketingCTA } from "./MarketingPage";
import workspace from "../../assets/home/workspace.jpg";
import design from "../../assets/home/design.jpg";

const values = [
  [
    "01",
    "Ruang untuk talenta.",
    "Karya kreatif lokal punya banyak kemungkinan. Kami ingin memberi kreator ruang untuk memperkenalkan keahlian dan layanan mereka.",
  ],
  [
    "02",
    "Kepercayaan yang dibangun.",
    "Profil, brief yang jelas, dan ulasan dari booking yang selesai membantu pelanggan mengenal orang di balik sebuah karya.",
  ],
  [
    "03",
    "Kolaborasi yang dekat.",
    "Percakapan membantu menyamakan harapan. Dari kebutuhan awal sampai perkembangan pesanan, setiap pihak punya ruang untuk saling memahami.",
  ],
];

export default function AboutPage() {
  return (
    <MarketingPage title="Tentang Digarsa">
      <header className="marketing-container marketing-about-hero">
        <span className="marketing-label marketing-pill">TENTANG DIGARSA</span>
        <h1>
          Tempat ide menemukan <br />
          <em>teman berkarya.</em>
        </h1>
        <p>
          Digarsa mempertemukan kebutuhan kreatif dengan talenta lokal. Untuk
          ide personal, usaha yang sedang tumbuh, dan karya yang ingin kamu
          mulai.
        </p>
        <figure className="marketing-hero-photo" data-marketing-reveal>
          <img
            src={workspace}
            alt="Ruang kerja dengan meja bersama, tanaman, dan cahaya alami"
            width="1600"
            height="900"
            fetchPriority="high"
          />
          <figcaption>
            <span>RUANG UNTUK KEMUNGKINAN BARU</span>
            <span>Where Ideas Meet Talent.</span>
          </figcaption>
        </figure>
      </header>
      <section
        className="marketing-container marketing-story marketing-section"
        aria-labelledby="story-title"
        data-marketing-reveal
      >
        <div>
          <span className="marketing-label">01 / GAGASAN KAMI</span>
          <h2 id="story-title">
            Ide lokal.
            <br />
            Kemungkinan
            <br />
            <em>yang luas.</em>
          </h2>
        </div>
        <div className="marketing-prose">
          <p className="marketing-lead">
            Sebuah usaha punya cerita. Seorang kreator punya cara untuk
            membuatnya terlihat, terdengar, dan terasa.
          </p>
          <p>
            UMKM yang ingin memperkenalkan produknya, pemilik usaha yang
            membutuhkan identitas visual, atau seseorang yang sedang menyiapkan
            proyek personal—semuanya membutuhkan partner kreatif yang sesuai.
          </p>
          <p>
            Digarsa hadir sebagai ruang pertemuan itu. Jelajahi layanan, kenali
            kreatornya, lalu mulai percakapan tentang apa yang ingin kamu
            wujudkan. Kami percaya proses kreatif yang baik dimulai dari saling
            memahami.
          </p>
          <Button to="/how-it-works" variant="secondary">
            Kenali cara kerjanya <span aria-hidden="true">↗</span>
          </Button>
        </div>
      </section>
      <section className="marketing-mission" aria-labelledby="mission-title">
        <div className="marketing-container marketing-mission__grid">
          <figure data-marketing-reveal>
            <img
              src={design}
              alt="Eksplorasi palet warna dan sketsa identitas visual di meja desainer"
              width="1200"
              height="1500"
              loading="lazy"
            />
            <figcaption>Setiap karya dimulai dari eksplorasi.</figcaption>
          </figure>
          <div data-marketing-reveal>
            <span className="marketing-label">02 / ARAH YANG KAMI TUJU</span>
            <h2 id="mission-title">
              Membuka ruang.
              <br />
              <em>Mendekatkan</em>
              <br />
              kesempatan.
            </h2>
            <p>
              Membantu pelanggan menemukan keahlian yang dibutuhkan, sekaligus
              memberi kreator ruang untuk mengembangkan peluang melalui karya.
            </p>
            <ul className="marketing-values">
              {values.map(([number, title, copy]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section
        className="marketing-container marketing-section"
        aria-labelledby="together-title"
      >
        <div className="marketing-section-heading" data-marketing-reveal>
          <span className="marketing-label">03 / DUA SISI, SATU RUANG</span>
          <h2 id="together-title">
            Ada tempat untuk
            <br />
            <em>ide dan keahlianmu.</em>
          </h2>
        </div>
        <div className="marketing-audiences">
          <article data-marketing-reveal>
            <span className="marketing-label">UNTUK PELANGGAN</span>
            <h3>
              Temukan orang
              <br />
              di balik karya.
            </h3>
            <p>
              Bandingkan layanan, lihat portofolio dan ulasan terverifikasi yang
              tersedia, lalu ajukan brief kepada kreator dengan layanan yang
              bisa dipesan. Ikuti permintaanmu dari akun yang sama.
            </p>
            <Button to="/marketplace" variant="secondary">
              Temukan layanan <span aria-hidden="true">↗</span>
            </Button>
          </article>
          <article data-marketing-reveal>
            <span className="marketing-label">UNTUK KREATOR</span>
            <h3>
              Beri keahlianmu
              <br />
              ruang untuk dikenal.
            </h3>
            <p>
              Aktifkan Seller Profile dari akun Digarsa, perkenalkan keahlianmu,
              dan publikasikan layanan. Kelola permintaan serta percakapan di
              Seller Center, sambil tetap bisa menjadi pelanggan.
            </p>
            <Button to="/become-a-creator" variant="secondary">
              Mulai sebagai kreator <span aria-hidden="true">↗</span>
            </Button>
          </article>
        </div>
        <p className="marketing-demo-note">
          Digarsa saat ini berupa demo lokal. Data akun dan aktivitas tersimpan
          di browser yang digunakan; pembayaran dan sinkronisasi lintas
          perangkat belum tersedia. Foto merupakan ilustrasi suasana kreatif.
        </p>
      </section>
      <MarketingCTA />
    </MarketingPage>
  );
}
