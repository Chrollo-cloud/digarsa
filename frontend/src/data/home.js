import design from "../assets/home/design.jpg";
import photography from "../assets/home/photography.jpg";
import digital from "../assets/home/digital.jpg";
import workspace from "../assets/home/workspace.jpg";

// Editorial demo content only; no marketplace or account integration.
export const projects = [
  {
    id: "identity",
    title: "Visual identity that feels like you",
    category: "Branding",
    studio: "Studio Arah",
    price: "Rp 1.200.000",
    image: design,
    alt: "Eksplorasi desain grafis dan warna",
  },
  {
    id: "film",
    title: "A little film, a lasting feeling",
    category: "Fotografi & Film",
    studio: "Ruang Cerita",
    price: "Rp 850.000",
    image: photography,
    alt: "Fotografer merekam lanskap dari sudut pandang baru",
  },
  {
    id: "digital",
    title: "A digital home for your next chapter",
    category: "Web & Digital",
    studio: "Temu Digital",
    price: "Rp 2.500.000",
    image: digital,
    alt: "Proses perancangan pengalaman digital",
  },
];

export const railProjects = [
  ...projects,
  {
    id: "direction",
    title: "Ruang untuk perspektif baru",
    category: "Art Direction",
    studio: "Studio Arah",
    price: "Rp 1.500.000",
    image: workspace,
    alt: "Ruang studio untuk kolaborasi kreatif",
  },
  {
    id: "editorial",
    title: "Cerita dari sudut yang berbeda",
    category: "Editorial",
    studio: "Ruang Cerita",
    price: "Rp 950.000",
    image: photography,
    alt: "Fotografer berkarya di tengah lanskap pegunungan",
  },
  {
    id: "illustration",
    title: "Warna yang menghidupkan ide",
    category: "Illustration",
    studio: "Rona Works",
    price: "Rp 700.000",
    image: design,
    alt: "Eksplorasi visual untuk karya ilustrasi",
  },
];

export const creators = [
  {
    id: "arah",
    name: "Studio Arah",
    role: "Brand & visual identity",
    city: "Bandung",
    image: design,
    description: "Identitas visual yang berani, hangat, dan punya cerita.",
    skills: ["Branding", "Art direction", "Packaging"],
  },
  {
    id: "ruang",
    name: "Ruang Cerita",
    role: "Photography & film",
    city: "Jakarta",
    image: photography,
    description:
      "Menangkap cerita dari ruang, manusia, dan sudut pandang baru.",
    skills: ["Photography", "Film", "Editorial"],
  },
  {
    id: "temu",
    name: "Temu Digital",
    role: "Digital product & web",
    city: "Yogyakarta",
    image: workspace,
    description:
      "Pengalaman digital yang intuitif untuk ide yang ingin tumbuh.",
    skills: ["UI/UX", "Web design", "Digital"],
  },
  {
    id: "rona",
    name: "Rona Works",
    role: "Illustration & motion",
    city: "Surabaya",
    image: digital,
    description: "Eksplorasi bentuk dan warna untuk karya yang terasa hidup.",
    skills: ["Illustration", "Motion", "Visual"],
  },
];
