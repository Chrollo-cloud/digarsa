export default function EditorialSection() {
  return (
    <section className="home-editorial" aria-labelledby="editorial-title">
      <div data-reveal>
        <span className="home-label">/experience</span>
        <h2 id="editorial-title">
          Why creative-
          <br />
          <em>first?</em>
        </h2>
      </div>
      <div className="home-editorial__copy" data-reveal>
        <p>
          Ide hebat lahir saat perspektif bertemu. Digarsa membantu bisnis
          menemukan suara visual yang tepat, sekaligus membuka ruang bagi
          kreator lokal untuk menunjukkan karya terbaiknya.
        </p>
        <div className="home-editorial__note">
          KOLABORASI YANG TERASA LEBIH DEKAT <span aria-hidden="true"></span>
        </div>
      </div>
    </section>
  );
}
