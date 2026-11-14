import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { publicServiceInclude, toPublicService, visibleCatalogWhere } from "../catalog/catalog.service.js";
import { recommendationQuerySchema, type RecommendationQuery } from "./recommendation.schema.js";
import {
  deterministicRecommendationEngine,
  type RecommendationEngine,
  type RecommendationProvider,
  validateProviderResults,
} from "./recommendation.service.js";
import { geminiRecommendationProvider } from "./gemini-recommendation.provider.js";

type RecommendationDatabase = Pick<PrismaClient, "service">;

function parseQuery(value: unknown): RecommendationQuery {
  const result = recommendationQuerySchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, "VALIDATION_FAILED", "Parameter rekomendasi tidak valid.", result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

function searchWhere(query: string): Prisma.ServiceWhereInput {
  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 8);
  return { OR: [
    { title: { contains: query, mode: "insensitive" } },
    { description: { contains: query, mode: "insensitive" } },
    { category: { is: { name: { contains: query, mode: "insensitive" } } } },
    { seller: { is: { displayName: { contains: query, mode: "insensitive" } } } },
    ...(tokens.length ? [{ seller: { is: { specialties: { hasSome: tokens } } } } as Prisma.ServiceWhereInput] : []),
  ] };
}

export function createRecommendationHandler(
  database: RecommendationDatabase,
  engine: RecommendationEngine = deterministicRecommendationEngine,
  provider: RecommendationProvider = geminiRecommendationProvider,
) {
  return async function getRecommendations(req: Request, res: Response) {
    const query = parseQuery(req.query);
    const where: Prisma.ServiceWhereInput = {
      AND: [
        visibleCatalogWhere,
        { status: "OPEN" },
        ...(query.query ? [searchWhere(query.query)] : []),
      ],
    };
    // Bound candidate retrieval independently of the caller's requested output
    // size. Deterministic DB ordering makes ties stable before in-memory rank.
    const candidates = await database.service.findMany({
      where,
      include: publicServiceInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 250,
    });
    const preferences = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.max_budget !== undefined ? { max_budget: query.max_budget } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.query ? { query: query.query } : {}),
    };
    const deterministicRanked = engine.rank(candidates, preferences);
    let ranked = deterministicRanked.slice(0, query.limit);
    let rankingSource: "rule_based" | "gemini" = "rule_based";
    let fallbackReason: string | undefined;

    if (query.mode === "gemini") {
      const availability = provider.availability();
      if (availability !== "AVAILABLE") {
        fallbackReason = availability;
      } else {
        const shortlist = deterministicRanked.slice(0, Math.min(12, Math.max(query.limit, 6)));
        let providerResult;
        try {
          providerResult = await provider.recommend({
            ...(query.query ? { query: query.query } : {}),
            preferences,
            candidates: shortlist.map(({ service }) => ({
              service_id: service.id,
              title: service.title,
              category: service.category.name,
              description: service.description,
              price: service.price,
              delivery: service.delivery,
              city: service.seller.city,
              avg_rating: service.reviewCount > 0 ? service.avgRating : null,
              review_count: service.reviewCount,
            })),
            limit: query.limit,
          });
        } catch {
          providerResult = { ok: false as const, code: "PROVIDER_ERROR" as const };
        }
        const validated = providerResult.ok
          ? validateProviderResults(shortlist.map(({ service }) => service), providerResult.value, query.limit)
          : [];
        if (validated.length) {
          const deterministicById = new Map(deterministicRanked.map((item) => [item.service.id, item]));
          ranked = validated.flatMap((service) => {
            const existing = deterministicById.get(service.id);
            return existing ? [{
              ...existing,
              explanation: ["Gemini memilih layanan ini berdasarkan permintaanmu.", ...existing.explanation],
            }] : [];
          });
          rankingSource = "gemini";
        } else {
          fallbackReason = providerResult.ok ? "INVALID_RESPONSE" : providerResult.code;
        }
      }
    }

    res.status(200).json({
      data: ranked.map(({ service, score, explanation }) => ({
        ...toPublicService(service),
        recommendation: {
          score,
          explanation,
          ranking_source: rankingSource,
        },
      })),
      meta: {
        ranking_source: rankingSource,
        provider_configured: provider.availability() === "AVAILABLE",
        candidate_limit: 250,
        ...(query.mode === "gemini" ? { mode: "gemini", ...(fallbackReason ? { fallback_reason: fallbackReason } : {}) } : {}),
      },
    });
  };
}

export const getRecommendations = createRecommendationHandler(prisma);
