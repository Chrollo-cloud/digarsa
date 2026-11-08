import { creators as editorialCreators, railProjects } from "./home";

export const money = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const owners = ["arah", "ruang", "temu", "arah", "ruang", "rona"];
const categoriesById = {
  direction: "Branding",
  editorial: "Fotografi & Film",
  illustration: "Illustration & Motion",
};
const descriptions = [
  "Bangun identitas yang mencerminkan karakter bisnismu. Paket mencakup eksplorasi logo, palet warna, tipografi, dan panduan penggunaan untuk media digital maupun cetak.",
  "Ceritakan brand dan momen penting lewat film pendek. Kami membantu penyusunan konsep, pengambilan gambar, hingga penyuntingan akhir dengan pendekatan yang personal.",
  "Rancang rumah digital yang nyaman untuk pelangganmu. Layanan mencakup riset kebutuhan, desain responsif, dan prototipe interaktif untuk halaman utama serta halaman pendukung.",
  "Satukan bahasa visual kampanye lewat art direction yang terarah. Kami menyiapkan moodboard, konsep kreatif, dan arahan produksi sesuai karakter brand.",
  "Fotografi editorial untuk cerita yang punya sudut pandang. Termasuk diskusi konsep, sesi pemotretan, pemilihan foto, dan penyuntingan warna.",
  "Ilustrasi khusus untuk kampanye dan konten digital. Mulai dari sketsa konsep hingga karya akhir beresolusi tinggi dengan warna yang disesuaikan untuk brand kamu.",
];
export const services = railProjects.map((project, index) => ({
  ...project,
  category: categoriesById[project.id] || project.category,
  creatorId: owners[index],
  price: [1200000, 850000, 2500000, 1500000, 950000, 700000][index],
  availability: index === 2 || index === 4 ? "Full-book" : "Open",
  delivery: index === 1 || index === 4 ? "Onsite" : "Remote",
  turnaround: [
    "7–10 hari kerja",
    "10–14 hari kerja",
    "14–21 hari kerja",
    "5–7 hari kerja",
    "3–5 hari kerja",
    "5–7 hari kerja",
  ][index],
  description: descriptions[index],
  images: [
    { src: project.image, alt: project.alt },
    {
      src: railProjects.find((item) => item.image !== project.image).image,
      alt: railProjects.find((item) => item.image !== project.image).alt,
    },
  ],
  reviews: [
    {
      id: `${project.id}-1`,
      name: "Nadia P.",
      score: 5,
      text: "Komunikasinya jelas dan hasilnya sesuai arah kreatif yang kami diskusikan.",
    },
    {
      id: `${project.id}-2`,
      name: "Bagas R.",
      score: index % 2 ? 4 : 5,
      text: "Proses kolaborasi rapi. Masukan kami ditanggapi dengan baik sepanjang pengerjaan.",
    },
  ],
}));
export const rating = (reviews) =>
  reviews.length
    ? (
        reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length
      ).toFixed(1)
    : "—";
export const creators = editorialCreators.map((creator) => ({
  ...creator,
  bio: `${creator.description} Kami mendampingi bisnis lokal dari percakapan pertama, eksplorasi konsep, hingga hasil akhir yang siap digunakan. Setiap proyek dimulai dengan memahami kebutuhan dan karakter klien.`,
  portfolio: services
    .filter((service) => service.creatorId === creator.id)
    .map((service) => ({
      image: service.image,
      alt: service.alt,
      title: service.title,
      serviceId: service.id,
    })),
}));
export const getCreator = (id) => creators.find((creator) => creator.id === id);
export const categories = [
  ...new Set(services.map((service) => service.category)),
];
export const locations = [...new Set(creators.map((creator) => creator.city))];

// --- Phase 7 catalog overlay -------------------------------------------------
// Seller Center publishes seller-owned services/profiles and admin moderation into
// these SAME exported arrays (mutated in place), so every existing page and the
// Phase 6 booking store keep reading one catalog. Base demo data is never lost.
const baseServices = [...services];
const baseCreators = [...creators];
const portfolioOf = (creatorId) =>
  services
    .filter((service) => service.creatorId === creatorId)
    .map((service) => ({
      image: service.image,
      alt: service.alt,
      title: service.title,
      serviceId: service.id,
    }));
export function syncCatalog({
  services: extraServices = [],
  creators: extraCreators = [],
  hiddenServiceIds = [],
} = {}) {
  const hidden = new Set(hiddenServiceIds);
  const taken = new Set(baseServices.map((service) => service.id));
  const knownCreators = new Set(baseCreators.map((creator) => creator.id));
  const people = extraCreators.filter(
    (creator) => !knownCreators.has(creator.id),
  );
  const personIds = new Set([...knownCreators, ...people.map((p) => p.id)]);
  const published = extraServices.filter(
    (service) => !taken.has(service.id) && personIds.has(service.creatorId),
  );
  services.splice(
    0,
    services.length,
    ...[...baseServices, ...published].filter(
      (service) => !hidden.has(service.id),
    ),
  );
  creators.splice(0, creators.length, ...baseCreators, ...people);
  creators.forEach((creator) => {
    creator.portfolio = portfolioOf(creator.id);
  });
  categories.splice(
    0,
    categories.length,
    ...new Set(services.map((service) => service.category)),
  );
  locations.splice(
    0,
    locations.length,
    ...new Set(creators.map((creator) => creator.city)),
  );
}
// Unmoderated base entries, for admin listings of the seeded demo catalog.
export const getBaseServices = () => [...baseServices];
