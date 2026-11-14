import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { publicServiceInclude, toPublicService, visibleCatalogWhere } from "../catalog/catalog.service.js";
import { recommendationQuerySchema, type RecommendationQuery } from "./recommendation.schema.js";
import { deterministicRecommendationEngine, type RecommendationEngine } from "./recommendation.service.js";

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
    const ranked = engine.rank(candidates, preferences).slice(0, query.limit);
    res.status(200).json({
      data: ranked.map(({ service, score, explanation }) => ({
        ...toPublicService(service),
        recommendation: {
          score,
          explanation,
          ranking_source: "rule_based",
        },
      })),
      meta: {
        ranking_source: "rule_based",
        provider_configured: false,
        candidate_limit: 250,
      },
    });
  };
}

export const getRecommendations = createRecommendationHandler(prisma);
