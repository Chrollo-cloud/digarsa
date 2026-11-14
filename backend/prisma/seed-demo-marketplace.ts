import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../src/lib/password.js";

const APPROVED_PROJECT_REF = "ztdhvlfewgczwycjyube";
const SEED_NAMESPACE = "digarsa-fictional-marketplace-v1";
const DEMO_SERVICE_TO_PRESERVE = "Demo Digital Poster Design";

type ServiceSeed = {
  slug: string;
  title: string;
  description: string;
  price: number;
  delivery: "Remote" | "Onsite";
  turnaround: string;
  revisionFreeCount: number;
  revisionRequestWindowHours: 24 | 48 | 72;
  revisionTerms: string;
};

type SellerSeed = {
  slug: string;
  name: string;
  displayName: string;
  category: string;
  city: string;
  region: string;
  bio: string;
  specialties: string[];
  services: [ServiceSeed, ServiceSeed];
};

// Slugs here are stable seed keys and are not persisted: the current Service
// model has no slug column. They generate deterministic UUIDs for idempotence.
const sellers: SellerSeed[] = [
  {
    slug: "andi-photography", name: "Andi Pratama", displayName: "Andi Photography",
    category: "Fotografi & Film", city: "Makassar", region: "South Sulawesi",
    bio: "Photographer in Makassar focused on warm wedding stories and thoughtful product imagery. Andi works with couples and local brands to create natural photographs that feel personal and easy to use.",
    specialties: ["Wedding photography", "Product photography", "Natural light"],
    services: [
      { slug: "wedding-storytelling-photography", title: "Wedding Storytelling Photography", description: "A relaxed wedding photography package covering the ceremony, family moments, and candid details. We plan a short shot list together and deliver a carefully edited gallery ready for sharing and print.", price: 4800000, delivery: "Onsite", turnaround: "14–18 hari kerja", revisionFreeCount: 1, revisionRequestWindowHours: 48, revisionTerms: "One round of adjustments to the selected color treatment is included. Requests for additional images, extensive retouching, or a new shooting session are outside the package." },
      { slug: "product-photography-online-shop", title: "Product Photography for Online Shops", description: "Clean product photographs for catalogs, marketplaces, and social media. The package includes a planning call, a consistent lighting setup, and edited images with simple backgrounds for a cohesive storefront.", price: 1350000, delivery: "Onsite", turnaround: "6–8 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two minor edits to crop, brightness, or color balance are included. Reshooting, new styling directions, and extra products are quoted separately." },
    ],
  },
  {
    slug: "naya-illustrates", name: "Naya Putri", displayName: "Naya Illustrates",
    category: "Illustration & Motion", city: "Yogyakarta", region: "Special Region of Yogyakarta",
    bio: "Illustrator creating expressive character art from Yogyakarta. Naya enjoys translating personality, color references, and small story details into original portraits for gifts, creators, and independent projects.",
    specialties: ["Anime portrait", "Chibi character", "Character color"],
    services: [
      { slug: "anime-style-character-portrait", title: "Anime-Style Character Portrait", description: "A custom half-body character portrait developed from your reference notes, outfit ideas, and preferred palette. You receive a polished digital illustration suitable for a profile, gift, or personal project.", price: 875000, delivery: "Remote", turnaround: "7–10 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two sketch-stage adjustments are included before final rendering. Changes to the approved pose, outfit, or concept after line work may require a new estimate." },
      { slug: "chibi-character-emote-pack", title: "Chibi Character and Emote Pack", description: "A cheerful chibi character drawn as a small coordinated set of expressions. The package is designed for stream overlays, community posts, and creator profiles, with transparent PNG exports.", price: 1425000, delivery: "Remote", turnaround: "10–14 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two rounds of expression or color adjustments are included. Additional poses, animated emotes, and changes to the character brief are quoted separately." },
    ],
  },
  {
    slug: "kreasi-studio", name: "Rizky Mahendra", displayName: "Kreasi Studio",
    category: "Branding", city: "Bandung", region: "West Java",
    bio: "Independent brand designer helping small Indonesian businesses build a clear visual identity. Rizky combines practical design systems with a collaborative process that keeps the owner's story at the center.",
    specialties: ["Brand identity", "Logo design", "Visual systems"],
    services: [
      { slug: "brand-identity-local-business", title: "Brand Identity for Local Businesses", description: "A practical identity package for a growing business, including logo exploration, a considered color palette, typography choices, and a concise usage guide for print and digital touchpoints.", price: 3650000, delivery: "Remote", turnaround: "14–18 hari kerja", revisionFreeCount: 3, revisionRequestWindowHours: 72, revisionTerms: "Three revision rounds are included across the selected logo direction and core identity assets. A new concept after approval or additional collateral is scoped separately." },
      { slug: "logo-refresh-mini-brand-guide", title: "Logo Refresh and Mini Brand Guide", description: "A thoughtful refresh for an existing logo that needs better balance and a more consistent digital presence. The handoff includes primary and compact logo files plus a short visual reference sheet.", price: 1780000, delivery: "Remote", turnaround: "8–12 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two rounds of refinements to the selected refresh are included. A full rebrand, naming work, or new illustration assets are not part of this service." },
    ],
  },
  {
    slug: "motion-by-dinda", name: "Dinda Ayuningtyas", displayName: "Motion by Dinda",
    category: "Illustration & Motion", city: "Jakarta", region: "Jakarta",
    bio: "Motion designer based in Jakarta, turning brand ideas into short, polished animations. Dinda works with clear storyboards and gentle movement so each deliverable feels lively without becoming difficult to use.",
    specialties: ["Logo animation", "Motion graphics", "Short-form video"],
    services: [
      { slug: "animated-logo-reveal", title: "Animated Logo Reveal", description: "A short logo animation for a website intro, presentation, or social post. The process starts with a simple storyboard and ends with a clean export sized for the platform you plan to use.", price: 1950000, delivery: "Remote", turnaround: "8–12 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two timing or motion refinements are included after the first animation preview. A new storyboard direction, sound design, or extra aspect ratio may require an additional estimate." },
      { slug: "social-campaign-motion-pack", title: "Social Campaign Motion Graphics Pack", description: "A coordinated set of short motion graphics for a campaign, product announcement, or event. We align on the visual rhythm first, then prepare exports that stay readable on mobile screens.", price: 2825000, delivery: "Remote", turnaround: "12–16 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two revision rounds are included for the agreed storyboard and copy. New scenes, copy changes after animation, or additional deliverable formats are scoped separately." },
    ],
  },
  {
    slug: "pixelcraft-studio", name: "Bima Saputra", displayName: "PixelCraft Studio",
    category: "Web & Digital", city: "Surabaya", region: "East Java",
    bio: "Digital product designer making websites easier to understand and navigate. Bima partners with founders and local teams to turn business goals into responsive interfaces with clear handoff notes.",
    specialties: ["Landing page UI", "E-commerce design", "Responsive layout"],
    services: [
      { slug: "landing-page-ui-design-handoff", title: "Landing Page UI Design and Handoff", description: "A focused landing page design for a product or service launch. It includes a responsive desktop and mobile layout, reusable visual components, and developer-ready notes for a straightforward implementation.", price: 2750000, delivery: "Remote", turnaround: "10–14 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two rounds of layout and visual refinements are included. Copywriting, front-end development, and additional pages are not included unless agreed separately." },
      { slug: "responsive-ecommerce-ui-kit", title: "Responsive E-commerce UI Kit", description: "A storefront interface concept covering the key shopping screens, from product discovery to product detail. The design emphasizes readable product information and a consistent mobile experience.", price: 4250000, delivery: "Remote", turnaround: "16–21 hari kerja", revisionFreeCount: 3, revisionRequestWindowHours: 72, revisionTerms: "Three refinement rounds are included for the agreed screen list. Checkout implementation, payment integration, and new screens outside the brief are excluded." },
    ],
  },
  {
    slug: "aruna-creative", name: "Aruna Maharani", displayName: "Aruna Creative",
    category: "Branding", city: "Denpasar", region: "Bali",
    bio: "Brand designer in Denpasar working with hospitality, food, and lifestyle businesses. Aruna brings local character into a flexible visual system that can move from packaging to menus and social channels.",
    specialties: ["Hospitality branding", "Packaging design", "Brand guidelines"],
    services: [
      { slug: "cafe-visual-identity-packaging", title: "Cafe Visual Identity and Packaging", description: "A warm visual identity for a cafe or food business, including logo direction, a color and type system, and one packaging application. The design is planned to feel consistent in-store and online.", price: 3380000, delivery: "Remote", turnaround: "14–18 hari kerja", revisionFreeCount: 3, revisionRequestWindowHours: 72, revisionTerms: "Three rounds of refinement are included across the agreed identity and one packaging item. Additional packaging formats, naming, and print production are separate." },
      { slug: "social-media-template-system", title: "Social Media Template System", description: "A set of reusable social layouts that helps a small brand publish with a recognizable look. Templates are organized around common announcements, product features, and community updates.", price: 1525000, delivery: "Remote", turnaround: "7–10 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two revision rounds are included for the agreed template set. Ongoing monthly content, copywriting, and new template categories are not included." },
    ],
  },
  {
    slug: "lensa-senja", name: "Siti Rahma", displayName: "Lensa Senja",
    category: "Fotografi & Film", city: "Balikpapan", region: "East Kalimantan",
    bio: "Portrait and food photographer who enjoys natural light and relaxed direction. Siti helps graduates, families, and independent food businesses feel comfortable in front of the camera and proud of the final images.",
    specialties: ["Graduation portraits", "Food photography", "Natural light"],
    services: [
      { slug: "graduation-portrait-session", title: "Graduation Portrait Session", description: "A friendly portrait session for graduation day, with a short planning chat and a mix of individual and family photographs. The final gallery is selected and edited for both sharing and keepsakes.", price: 1275000, delivery: "Onsite", turnaround: "6–9 hari kerja", revisionFreeCount: 1, revisionRequestWindowHours: 48, revisionTerms: "One round of light color or crop adjustments is included for selected photographs. Extra session time, additional locations, and detailed retouching are charged separately." },
      { slug: "menu-food-photography", title: "Menu Food Photography", description: "Appetizing menu imagery for cafes and small food brands, planned around the dishes and atmosphere you want customers to notice. The session includes a consistent image style for online menus and social posts.", price: 1925000, delivery: "Onsite", turnaround: "8–12 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two minor edits to crop and color are included. Reshoots, additional dishes, prop sourcing, and changes to the agreed visual direction are quoted separately." },
    ],
  },
  {
    slug: "frame-and-folk", name: "Fajar Wicaksono", displayName: "Frame & Folk",
    category: "Fotografi & Film", city: "Malang", region: "East Java",
    bio: "Documentary-minded photographer and filmmaker drawn to honest moments and community stories. Fajar works across East Java on small events, independent projects, and short films with a natural, unforced feel.",
    specialties: ["Event photography", "Documentary film", "Story-led editing"],
    services: [
      { slug: "candid-event-photography", title: "Candid Event Photography", description: "Coverage for a community gathering, launch, or intimate celebration, with an emphasis on people and the details that make the day distinct. Images are delivered in a curated, easy-to-browse gallery.", price: 3125000, delivery: "Onsite", turnaround: "10–14 hari kerja", revisionFreeCount: 1, revisionRequestWindowHours: 48, revisionTerms: "One adjustment round for the overall color treatment is included. Event extensions, extra photographers, and detailed individual retouching are not included." },
      { slug: "short-documentary-brand-film", title: "Short Documentary Brand Film", description: "A compact story-led film introducing a founder, craft, or local initiative. We plan the interview and visual outline together, then capture and edit a short final cut for web and social use.", price: 5350000, delivery: "Onsite", turnaround: "18–24 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two edit rounds are included for pacing, captions, and color. New interview sessions, major story changes after filming, and extra cut-downs are scoped separately." },
    ],
  },
  {
    slug: "ruang-visual", name: "Putri Anindya", displayName: "Ruang Visual",
    category: "Branding", city: "Semarang", region: "Central Java",
    bio: "Visual designer helping emerging products look clear and considered on a shelf or online. Putri combines research and practical layout decisions to make packaging and brand materials feel coherent.",
    specialties: ["Packaging design", "Brand systems", "Editorial layout"],
    services: [
      { slug: "product-packaging-design", title: "Product Packaging Design", description: "A packaging concept for one product line, built around clear hierarchy and a distinctive shelf presence. The handoff includes print-ready design files and a simple mockup to help review the direction.", price: 2175000, delivery: "Remote", turnaround: "10–15 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two rounds of layout and color refinements are included. Copywriting, additional product sizes, regulatory review, and print production are not included." },
      { slug: "brand-naming-and-logo-concept", title: "Brand Naming and Logo Concept", description: "A small-business naming and logo exploration that connects your audience, offer, and personality. The package gives you a focused shortlist and a developed visual direction for the selected name.", price: 2950000, delivery: "Remote", turnaround: "12–16 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two shortlist refinement rounds and two logo refinement rounds are included. Trademark searches, legal advice, and additional naming territories are excluded." },
    ],
  },
  {
    slug: "studio-kode", name: "Rafi Hidayat", displayName: "Studio Kode",
    category: "Web & Digital", city: "Jakarta", region: "Jakarta",
    bio: "Product interface designer focused on useful flows for mobile apps and small digital services. Rafi translates rough requirements into clear screens and clickable prototypes that teams can discuss before development.",
    specialties: ["Mobile app UI", "Clickable prototype", "Product flows"],
    services: [
      { slug: "mobile-app-interface-prototype", title: "Mobile App Interface Prototype", description: "A clickable prototype for a focused mobile app flow, from the first key task to a clear completion state. The work includes a small component set and notes that make the design decisions easy to review.", price: 5650000, delivery: "Remote", turnaround: "18–24 hari kerja", revisionFreeCount: 3, revisionRequestWindowHours: 72, revisionTerms: "Three rounds of changes are included across the agreed flows. New features, production code, and extensive research beyond the discovery session are separate." },
      { slug: "small-business-website-ui", title: "Small Business Website UI Design", description: "A responsive website concept for a small business that needs a clear introduction, service information, and a helpful contact path. The package covers the agreed page set and mobile layouts.", price: 3275000, delivery: "Remote", turnaround: "12–16 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two design refinement rounds are included for the agreed pages. Website development, copywriting, hosting, and additional pages are not included." },
    ],
  },
  {
    slug: "citra-motion-lab", name: "Citra Larasati", displayName: "Citra Motion Lab",
    category: "Illustration & Motion", city: "Yogyakarta", region: "Special Region of Yogyakarta",
    bio: "Illustrator and animator creating friendly characters and short explainers for education and community projects. Citra likes simple visual storytelling that gives an idea warmth while keeping it easy to follow.",
    specialties: ["Mascot illustration", "2D animation", "Visual storytelling"],
    services: [
      { slug: "mascot-illustration-sticker-set", title: "Mascot Illustration and Sticker Set", description: "An original mascot developed from your brand personality and audience, followed by a small set of expressive sticker poses. The final files are prepared for digital use and simple promotional materials.", price: 1625000, delivery: "Remote", turnaround: "9–13 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two sketch refinement rounds are included before final color. Additional poses, character licensing changes, and animation are quoted separately." },
      { slug: "two-dimensional-explainer-animation", title: "2D Explainer Animation", description: "A short animated explainer that organizes a simple message into a clear visual sequence. We agree on a storyboard and pacing before animation so the finished video stays focused and easy to understand.", price: 4950000, delivery: "Remote", turnaround: "18–24 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 72, revisionTerms: "Two storyboard revisions and two timing or color refinements are included. Scriptwriting, voice talent, new scenes after approval, and alternate-language versions are extra." },
    ],
  },
  {
    slug: "studio-arah-digital", name: "Yoga Prasetyo", displayName: "Studio Arah Digital",
    category: "Web & Digital", city: "Makassar", region: "South Sulawesi",
    bio: "Digital designer supporting local organizations with clear dashboards and campaign pages. Yoga focuses on readable information, accessible interface patterns, and practical handoff documentation for development teams.",
    specialties: ["Dashboard UI", "Web design", "Accessibility basics"],
    services: [
      { slug: "dashboard-ui-ux-design", title: "Dashboard UI and UX Design", description: "A dashboard concept for a small team that needs to understand its key information quickly. The service includes an agreed set of views, responsive behavior notes, and a clickable prototype for feedback.", price: 6350000, delivery: "Remote", turnaround: "18–24 hari kerja", revisionFreeCount: 3, revisionRequestWindowHours: 72, revisionTerms: "Three refinement rounds are included across the agreed views. Data engineering, backend development, and new dashboard sections are outside the design scope." },
      { slug: "campaign-landing-page-ui", title: "Campaign Landing Page UI", description: "A focused campaign page that presents an offer, supporting details, and a clear next step. The design uses a mobile-first layout and a compact visual system suited to a short campaign window.", price: 2675000, delivery: "Remote", turnaround: "9–13 hari kerja", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "Two visual refinement rounds are included for the agreed copy and layout. Copywriting, campaign management, analytics setup, and coding are not included." },
    ],
  },
];

function deterministicUuid(key: string) {
  const bytes = createHash("sha256").update(`${SEED_NAMESPACE}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isApprovedProjectUrl(raw: string | undefined) {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username).toLowerCase();
    return host.startsWith(`db.${APPROVED_PROJECT_REF}.`)
      || host.includes(`${APPROVED_PROJECT_REF}.`)
      || user === `postgres.${APPROVED_PROJECT_REF}`
      || user.endsWith(`.${APPROVED_PROJECT_REF}`);
  } catch { return false; }
}

function assertProfileMatches(actual: { name: string; role: string; accountStatus: string }, seed: SellerSeed) {
  if (actual.name !== seed.name || actual.role !== "USER" || actual.accountStatus !== "ACTIVE") {
    throw new Error(`Existing demo-seed account conflicts with stable seed key '${seed.slug}'. No account data was changed.`);
  }
}

function assertSellerMatches(actual: { userId: string; displayName: string; category: string; city: string; bio: string | null; region: string; verificationStatus: string }, seed: SellerSeed, userId: string) {
  if (actual.userId !== userId || actual.displayName !== seed.displayName || actual.category !== seed.category || actual.city !== seed.city || actual.bio !== seed.bio || actual.region !== seed.region || actual.verificationStatus !== "APPROVED") {
    throw new Error(`Existing seller profile conflicts with stable seed key '${seed.slug}'. No profile data was changed.`);
  }
}

function assertServiceMatches(actual: { sellerId: string; category: { name: string }; title: string; description: string; price: number; delivery: string; turnaround: string; revisionFreeCount: number | null; revisionRequestWindowHours: number | null; revisionTerms: string | null; active: boolean; isHidden: boolean; moderationStatus: string; status: string }, seed: ServiceSeed, sellerId: string, category: string) {
  if (actual.sellerId !== sellerId || actual.category.name !== category || actual.title !== seed.title || actual.description !== seed.description || actual.price !== seed.price || actual.delivery !== seed.delivery || actual.turnaround !== seed.turnaround || actual.revisionFreeCount !== seed.revisionFreeCount || actual.revisionRequestWindowHours !== seed.revisionRequestWindowHours || actual.revisionTerms !== seed.revisionTerms || !actual.active || actual.isHidden || actual.moderationStatus !== "APPROVED" || actual.status !== "OPEN") {
    throw new Error(`Existing service conflicts with stable seed key '${seed.slug}'. No service data was changed.`);
  }
}

if (process.env.NODE_ENV !== "development") {
  throw new Error("Demo marketplace seed requires NODE_ENV=development.");
}
if (!isApprovedProjectUrl(process.env.DATABASE_URL) || !isApprovedProjectUrl(process.env.DIRECT_URL) || !isApprovedProjectUrl(process.env.SUPABASE_URL)) {
  throw new Error("Demo marketplace seed refused: configured database URLs do not all match the approved development project.");
}
const caPath = resolve("certs/prod-ca-2021.crt");
const prismaConfig = readFileSync(resolve("src/config/prisma.ts"), "utf8");
if (!existsSync(caPath) || !prismaConfig.includes("rejectUnauthorized: true") || !prismaConfig.includes("prod-ca-2021.crt")) {
  throw new Error("Demo marketplace seed refused: required strict runtime TLS CA configuration is unavailable.");
}

const { prisma } = await import("../src/config/prisma.js");
try {
  const [identity] = await prisma.$queryRaw<Array<{ database: string; schema: string; port: number; role: string }>>`SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, current_user AS role`;
  if (identity.database !== "postgres" || identity.schema !== "public" || Number(identity.port) !== 5432 || identity.role !== "prisma") {
    throw new Error("Demo marketplace seed refused: runtime database identity differs from the preflighted development target.");
  }

  const categoryRows = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const categoryIds = new Map(categoryRows.map((category) => [category.name, category.id]));
  const actualCategories = new Set(categoryRows.map((category) => category.name));
  const plannedCategories = new Set(sellers.map((seller) => seller.category));
  if (plannedCategories.size !== actualCategories.size || [...actualCategories].some((category) => !plannedCategories.has(category))) {
    throw new Error("Demo marketplace seed refused: seller distribution does not cover exactly the currently active categories.");
  }
  for (const seller of sellers) {
    if (!categoryIds.has(seller.category)) throw new Error(`Seed category is not active in the database: ${seller.category}`);
  }

  const before = {
    users: await prisma.user.findMany({ select: { id: true } }),
    sellers: await prisma.sellerProfile.findMany({ select: { id: true } }),
    services: await prisma.service.findMany({ select: { id: true, title: true } }),
    categories: await prisma.category.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, slug: true, isActive: true } }),
  };
  const beforeUserIds = new Set(before.users.map((row) => row.id));
  const beforeSellerIds = new Set(before.sellers.map((row) => row.id));
  const beforeServiceIds = new Set(before.services.map((row) => row.id));
  const categorySnapshot = JSON.stringify(before.categories);
  const demoServiceBefore = before.services.find((service) => service.title === DEMO_SERVICE_TO_PRESERVE);

  const prepared = [] as Array<{ seller: SellerSeed; userId: string; sellerId: string; email: string; userPasswordHash?: string; services: Array<{ spec: ServiceSeed; id: string }> }>;
  for (const seller of sellers) {
    const userId = deterministicUuid(`user:${seller.slug}`);
    const sellerId = deterministicUuid(`seller:${seller.slug}`);
    const email = `demo+${seller.slug}@digarsa.invalid`;
    const existingByEmail = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true, accountStatus: true } });
    if (existingByEmail && existingByEmail.id !== userId) throw new Error(`Email collision for stable seed account '${seller.slug}'. No data was changed.`);
    if (existingByEmail) assertProfileMatches(existingByEmail, seller);
    const existingSellerById = await prisma.sellerProfile.findUnique({ where: { id: sellerId }, select: { userId: true, displayName: true, category: true, city: true, bio: true, region: true, verificationStatus: true } });
    const existingSellerByUser = await prisma.sellerProfile.findUnique({ where: { userId }, select: { id: true, userId: true, displayName: true, category: true, city: true, bio: true, region: true, verificationStatus: true } });
    if (existingSellerById) assertSellerMatches(existingSellerById, seller, userId);
    if (existingSellerByUser && existingSellerByUser.id !== sellerId) throw new Error(`Seller profile collision for stable seed key '${seller.slug}'. No data was changed.`);
    if (existingSellerByUser) assertSellerMatches(existingSellerByUser, seller, userId);

    const serviceRows = [] as Array<{ spec: ServiceSeed; id: string }>;
    for (const spec of seller.services) {
      const id = deterministicUuid(`service:${spec.slug}`);
      const existingById = await prisma.service.findUnique({ where: { id }, include: { category: { select: { name: true } } } });
      if (existingById) assertServiceMatches(existingById, spec, sellerId, seller.category);
      const titleCollision = await prisma.service.findFirst({ where: { title: spec.title }, select: { id: true } });
      if (titleCollision && titleCollision.id !== id) throw new Error(`Service title collision for '${spec.title}'. No data was changed.`);
      serviceRows.push({ spec, id });
    }
    prepared.push({ seller, userId, sellerId, email, ...(!existingByEmail ? { userPasswordHash: await hashPassword(randomBytes(32).toString("base64url")) } : {}), services: serviceRows });
  }

  const created = { users: 0, sellers: 0, services: 0 };
  const verification = await prisma.$transaction(async (tx) => {
    for (const item of prepared) {
      const user = await tx.user.findUnique({ where: { id: item.userId }, select: { id: true } });
      if (!user) {
        await tx.user.create({ data: { id: item.userId, email: item.email, passwordHash: item.userPasswordHash!, name: item.seller.name, role: "USER", accountStatus: "ACTIVE" } });
        created.users += 1;
      }
      const profile = await tx.sellerProfile.findUnique({ where: { id: item.sellerId }, select: { id: true } });
      if (!profile) {
        await tx.sellerProfile.create({ data: {
          id: item.sellerId, userId: item.userId, displayName: item.seller.displayName,
          category: item.seller.category, city: item.seller.city, region: item.seller.region,
          bio: item.seller.bio, specialties: item.seller.specialties, image: null,
          verificationStatus: "APPROVED",
        } });
        created.sellers += 1;
      }
      for (const { spec, id } of item.services) {
        const existing = await tx.service.findUnique({ where: { id }, select: { id: true } });
        if (existing) continue;
        await tx.service.create({ data: {
          id, sellerId: item.sellerId, categoryId: categoryIds.get(item.seller.category)!,
          title: spec.title, description: spec.description, price: spec.price,
          delivery: spec.delivery, turnaround: spec.turnaround,
          revisionFreeCount: spec.revisionFreeCount,
          revisionRequestWindowHours: spec.revisionRequestWindowHours,
          revisionTerms: spec.revisionTerms, revisionPolicyVersion: 1,
          image: null, active: true, isHidden: false, status: "OPEN",
          moderationStatus: "APPROVED", region: item.seller.region,
        } });
        created.services += 1;
      }
    }
    const [afterUsers, afterSellers, afterServices, afterCategories] = await Promise.all([
      tx.user.findMany({ select: { id: true } }),
      tx.sellerProfile.findMany({ select: { id: true } }),
      tx.service.findMany({ select: { id: true, sellerId: true, title: true, category: { select: { name: true } } } }),
      tx.category.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, slug: true, isActive: true } }),
    ]);
    if ([...beforeUserIds].some((id) => !afterUsers.some((row) => row.id === id))) throw new Error("Preservation check failed: an existing user is missing after seeding.");
    if ([...beforeSellerIds].some((id) => !afterSellers.some((row) => row.id === id))) throw new Error("Preservation check failed: an existing seller is missing after seeding.");
    if ([...beforeServiceIds].some((id) => !afterServices.some((row) => row.id === id))) throw new Error("Preservation check failed: an existing service is missing after seeding.");
    if (JSON.stringify(afterCategories) !== categorySnapshot) throw new Error("Preservation check failed: category records changed during seeding.");
    const demoServiceAfter = afterServices.find((service) => service.title === DEMO_SERVICE_TO_PRESERVE);
    if (demoServiceBefore && (!demoServiceAfter || demoServiceAfter.id !== demoServiceBefore.id)) throw new Error("Preservation check failed: the existing demo service changed.");
    const sellerServiceCounts = await tx.service.groupBy({ by: ["sellerId"], _count: { _all: true }, where: { sellerId: { in: prepared.map((item) => item.sellerId) } } });
    if (sellerServiceCounts.length !== sellers.length || sellerServiceCounts.some((row) => row._count._all !== 2)) throw new Error("Post-seed verification failed: every seeded seller must have exactly two services.");
    const [usersCount, categoriesCount, sellersCount, servicesCount] = await Promise.all([
      tx.user.count(), tx.category.count(), tx.sellerProfile.count(), tx.service.count(),
    ]);
    return { countsAfter: { users: usersCount, categories: categoriesCount, sellers: sellersCount, services: servicesCount }, demoServicePresent: Boolean(demoServiceAfter) };
  }, { timeout: 60000, maxWait: 10000 });

  console.log(JSON.stringify({
    result: "PASS",
    project: "approved-development-project",
    databaseIdentity: { database: identity.database, schema: identity.schema, role: identity.role, port: Number(identity.port) },
    created,
    countsAfter: verification.countsAfter,
    seededSellers: prepared.map(({ seller, services }) => ({ name: seller.name, displayName: seller.displayName, city: seller.city, category: seller.category, services: services.map(({ spec }) => ({ title: spec.title, price: spec.price, slugKey: spec.slug })) })),
    preserved: { baselineUserIds: beforeUserIds.size, baselineSellerIds: beforeSellerIds.size, baselineServiceIds: beforeServiceIds.size, categoriesUnchanged: true, demoServicePresent: verification.demoServicePresent },
    note: "Service slugs are internal deterministic seed keys only; schema has no Service.slug column. Seeded accounts have random unrecoverable password hashes. Approval states are development seed data only; no review history or identity data was created.",
  }));
} finally {
  await prisma.$disconnect();
}
