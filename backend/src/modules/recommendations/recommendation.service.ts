import type { PublicServiceRow } from "../catalog/catalog.service.js";
import type { GeminiResult } from "../../lib/ai/gemini-provider.js";

export type RecommendationPreferences = {
  category?: string;
  max_budget?: number;
  city?: string;
  query?: string;
};

type RecommendationCandidate = Pick<PublicServiceRow, "id" | "title" | "description" | "price" | "avgRating" | "reviewCount" | "createdAt">
  & Pick<PublicServiceRow, "category" | "seller">;

export type RankedRecommendation<T> = {
  service: T;
  score: number;
  explanation: string[];
};

export type ProviderRecommendation = {
  service_id: string;
};

export type RecommendationProviderCandidate = {
  service_id: string;
  title: string;
  category: string;
  description: string;
  price: number;
  delivery: string;
  city: string;
  avg_rating: number | null;
  review_count: number;
};

/**
 * Contract for the external Gemini reranker. Pass only a bounded list of eligible
 * service IDs plus the minimum query/preferences needed for interpretation.
 * Provider responses are untrusted and must pass validateProviderResults.
 */
export interface RecommendationProvider {
  recommend(input: {
    query?: string;
    preferences: RecommendationPreferences;
    candidates: readonly RecommendationProviderCandidate[];
    limit: number;
  }): Promise<GeminiResult<ProviderRecommendation[]>>;
  availability(): "AVAILABLE" | "DISABLED" | "NOT_CONFIGURED";
}

/**
 * Provider boundary for the model-backed reranker. Implementations must
 * return only IDs from the supplied eligible candidates; catalog eligibility
 * is always enforced by the controller before this interface is called.
 */
export interface RecommendationEngine {
  rank<T extends RecommendationCandidate>(
    candidates: T[],
    preferences: RecommendationPreferences,
  ): RankedRecommendation<T>[];
}

/** Drops invented IDs, duplicate IDs, malformed rows and excess results. */
export function validateProviderResults<T extends { id: string }>(
  candidates: readonly T[],
  providerResults: unknown,
  limit: number,
) {
  if (!Array.isArray(providerResults)) return [] as T[];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const validated: T[] = [];
  for (const item of providerResults) {
    if (validated.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const result = item as { service_id?: unknown; explanation?: unknown };
    if (typeof result.service_id !== "string" || seen.has(result.service_id)) continue;
    const service = candidateById.get(result.service_id);
    if (!service) continue;
    seen.add(result.service_id);
    validated.push(service);
  }
  return validated;
}

// Relative weights: category 30%, budget 25%, location 20%, rating confidence
// 20%, and query relevance 15%. Only supplied preference dimensions are
// included; the active weights are normalized so a missing preference does
// not penalize a service. Rating confidence remains part of cold-start ranking.
const WEIGHTS = {
  category: 0.3,
  budget: 0.25,
  location: 0.2,
  rating: 0.2,
  query: 0.15,
} as const;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("id-ID");
}

function categoryScore<T extends RecommendationCandidate>(service: T, category: string) {
  return normalize(service.category.name) === normalize(category) ? 100 : 0;
}

function budgetScore<T extends RecommendationCandidate>(service: T, budget: number) {
  if (budget === 0) return service.price === 0 ? 100 : 0;
  if (service.price > budget) return 0;
  return Math.round(65 + 35 * ((budget - service.price) / budget));
}

function locationScore<T extends RecommendationCandidate>(service: T, city: string) {
  if (!service.seller.city.trim()) return 50;
  return normalize(service.seller.city) === normalize(city) ? 100 : 0;
}

function ratingConfidence<T extends RecommendationCandidate>(service: T) {
  if (service.reviewCount <= 0 || !Number.isFinite(service.avgRating)) return 50;
  const rawRating = Math.max(0, Math.min(5, service.avgRating)) * 20;
  const confidence = service.reviewCount / (service.reviewCount + 5);
  // Shrink low-sample ratings toward neutral rather than treating one review
  // as equivalent to a well-established rating.
  return 50 + (rawRating - 50) * confidence;
}

function queryScore<T extends RecommendationCandidate>(service: T, query: string) {
  const tokens = [...new Set(normalize(query).split(/\s+/).filter(Boolean))].slice(0, 12);
  if (!tokens.length) return 50;
  const searchable = normalize([
    service.title,
    service.description,
    service.category.name,
    service.seller.displayName,
    ...service.seller.specialties,
  ].join(" "));
  const matched = tokens.filter((token) => searchable.includes(token)).length;
  return (matched / tokens.length) * 100;
}

function buildExplanation<T extends RecommendationCandidate>(service: T, preferences: RecommendationPreferences) {
  const explanations: string[] = [];
  if (preferences.category && categoryScore(service, preferences.category) === 100) {
    explanations.push(`Sesuai kategori ${service.category.name}.`);
  }
  if (preferences.max_budget !== undefined) {
    explanations.push(service.price <= preferences.max_budget
      ? `Harga Rp${service.price.toLocaleString("id-ID")} sesuai batas anggaran.`
      : `Harga Rp${service.price.toLocaleString("id-ID")} melebihi batas anggaran.`);
  }
  if (preferences.city && service.seller.city && locationScore(service, preferences.city) === 100) {
    explanations.push(`Kreator berdomisili di ${service.seller.city}.`);
  }
  if (service.reviewCount > 0) {
    explanations.push(`Rating ${service.avgRating.toFixed(1)} dari ${service.reviewCount} ulasan.`);
  }
  if (preferences.query && queryScore(service, preferences.query) > 50) {
    explanations.push("Judul, kategori, atau deskripsi cocok dengan pencarianmu.");
  }
  if (!explanations.length) {
    explanations.push(service.reviewCount > 0
      ? "Pilihan aktif dengan rating dan jumlah ulasan yang dipertimbangkan."
      : "Layanan aktif yang tersedia untuk dipesan.");
  }
  return explanations;
}

export const deterministicRecommendationEngine: RecommendationEngine = {
  rank<T extends RecommendationCandidate>(candidates: T[], preferences: RecommendationPreferences) {
    const dimensions: { weight: number; score: (service: T) => number }[] = [];
    if (preferences.category) dimensions.push({ weight: WEIGHTS.category, score: (service) => categoryScore(service, preferences.category!) });
    if (preferences.max_budget !== undefined) dimensions.push({ weight: WEIGHTS.budget, score: (service) => budgetScore(service, preferences.max_budget!) });
    if (preferences.city) dimensions.push({ weight: WEIGHTS.location, score: (service) => locationScore(service, preferences.city!) });
    dimensions.push({ weight: WEIGHTS.rating, score: ratingConfidence });
    if (preferences.query) dimensions.push({ weight: WEIGHTS.query, score: (service) => queryScore(service, preferences.query!) });
    const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);

    return candidates.map((service) => ({
      service,
      score: Number((dimensions.reduce((sum, dimension) => sum + dimension.score(service) * dimension.weight, 0) / totalWeight).toFixed(2)),
      explanation: buildExplanation(service, preferences),
    })).sort((left, right) => right.score - left.score
      || right.service.createdAt.getTime() - left.service.createdAt.getTime()
      || left.service.id.localeCompare(right.service.id));
  },
};
