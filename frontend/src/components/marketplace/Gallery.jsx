import { useState } from "react";

export default function Gallery({ images, title }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <section className="market-gallery" aria-label={`Galeri ${title}`}>
      <div className="market-gallery__stage market-gallery__empty" role="img" aria-label="No service images available">Image unavailable</div>
    </section>;
  }
  return (
    <section className="market-gallery" aria-label={`Galeri ${title}`}>
      <div className="market-gallery__stage">
        <img src={images[active].src} alt={images[active].alt} />
        <button
          type="button"
          className="is-prev"
          aria-label="Gambar sebelumnya"
          onClick={() =>
            setActive((active - 1 + images.length) % images.length)
          }
        >
          ←
        </button>
        <button
          type="button"
          className="is-next"
          aria-label="Gambar berikutnya"
          onClick={() => setActive((active + 1) % images.length)}
        >
          →
        </button>
        <span role="status">
          {active + 1} / {images.length}
        </span>
      </div>
      <div className="market-gallery__thumbs">
        {images.map((image, index) => (
          <button
            key={`${image.src}-${index}`}
            type="button"
            aria-label={`Tampilkan gambar ${index + 1}`}
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            <img src={image.src} alt="" />
          </button>
        ))}
      </div>
    </section>
  );
}
