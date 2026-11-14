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
    alt: "A photographer captures a landscape from a new perspective",
  },
  {
    id: "digital",
    title: "A digital home for your next chapter",
    category: "Web & Digital",
    studio: "Temu Digital",
    price: "Rp 2.500.000",
    image: digital,
    alt: "Process perancangan pengalaman digital",
  },
];

export const railProjects = [
  ...projects,
  {
    id: "direction",
    title: "Space for a new perspective",
    category: "Art Direction",
    studio: "Studio Arah",
    price: "Rp 1.500.000",
    image: workspace,
    alt: "A studio space for creative collaboration",
  },
  {
    id: "editorial",
    title: "Stories from a different angle",
    category: "Editorial",
    studio: "Ruang Cerita",
    price: "Rp 950.000",
    image: photography,
    alt: "Fotografer berkarya di tengah lanskap pegunungan",
  },
  {
    id: "illustration",
    title: "Colors that bring ideas to life",
    category: "Illustration",
    studio: "Rona Works",
    price: "Rp 700.000",
    image: design,
    alt: "A visual exploration for an illustration",
  },
];

export const creators = [
  {
    id: "arah",
    name: "Studio Arah",
    role: "Brand & visual identity",
    city: "Bandung",
    image: design,
    description: "A bold, warm visual identity with a story to tell.",
    skills: ["Branding", "Art direction", "Packaging"],
  },
  {
    id: "ruang",
    name: "Ruang Cerita",
    role: "Photography & film",
    city: "Jakarta",
    image: photography,
    description:
      "Capturing stories of spaces, people, and fresh perspectives.",
    skills: ["Photography", "Film", "Editorial"],
  },
  {
    id: "temu",
    name: "Temu Digital",
    role: "Digital product & web",
    city: "Yogyakarta",
    image: workspace,
    description:
      "Intuitive digital experiences for ideas ready to grow.",
    skills: ["UI/UX", "Web design", "Digital"],
  },
  {
    id: "rona",
    name: "Rona Works",
    role: "Illustration & motion",
    city: "Surabaya",
    image: digital,
    description: "Exploring shape and color to create work that feels alive.",
    skills: ["Illustration", "Motion", "Visual"],
  },
];
