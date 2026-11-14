# Recommendations API

`GET /api/v1/recommendations` returns real, public catalog services from Prisma. The default source is explicitly `rule_based`; Gemini is used only when a signed-in user opts in with `mode=gemini` and server configuration has `AI_ENABLED=true` plus a key.

Optional query parameters are `category`, `max_budget`, `city`, `query`, `limit` (1–50, default 10), and `mode` (`rule_based` by default or `gemini`). Category, budget, and city are ranking preferences. `query` narrows candidates using public service title, description, category, creator name, and specialties. The opt-in Gemini mode requires JWT authentication and is rate-limited to 8 calls per account per minute. Public rule-based requests remain anonymous and never call Gemini.

Example opt-in request: `GET /api/v1/recommendations?query=logo%20UMKM&city=Makassar&mode=gemini`. The existing `data` entries remain catalog service DTOs; each gets `recommendation.ranking_source`, and `meta` reports the selected source plus a generic `fallback_reason` only when Gemini was unavailable or unusable. The model does not return service records or customer-facing factual claims.

## Eligibility and bounds

The controller requires `visibleCatalogWhere` and `status: OPEN` before ranking, requests at most 250 rows, and maps each result with the existing `toPublicService()` mapper. Thus public DTO privacy and visibility rules remain shared with the catalog. A preference cannot make a hidden, unapproved, unverified, suspended-account, or full-book service eligible.

## Deterministic ranking

Initial relative weights are category 30%, budget 25%, location 20%, rating confidence 20%, and query relevance 15%. Supplied preference dimensions are normalized over their active weights. Rating confidence shrinks small-sample ratings toward a neutral score of 50, using `review_count / (review_count + 5)`. Missing ratings and seller city receive neutral scores. Ties use newest creation date and then ascending service ID. If no preferences are supplied, rating confidence and deterministic tie-breakers provide the cold-start order.

Explanations are derived from actual service category, price, seller city, and persisted ratings. Responses add `recommendation.score`, `recommendation.explanation`, and `recommendation.ranking_source` without changing catalog service fields.

## Gemini provider integration

The Gemini provider accepts at most 12 deterministic shortlist candidates with only public service fields, capped text lengths, and the user query/preferences. Its structured output is Zod-validated; unknown and duplicate IDs are dropped, and the backend maps IDs back to eligible database rows. Only the verified catalog DTO is returned. Explanations are composed from verified row attributes, not trusted from model text. Disabled, unconfigured, timeout, quota, malformed, or thrown provider errors fall back to deterministic ranking with `ranking_source: rule_based` and a safe `fallback_reason`.

Credentials are server-side only. AI requests use a single SDK attempt, bounded output tokens, an abort timeout, and account-scoped rate limiting. The current in-memory limiter is process-local; production multi-instance deployments need a shared rate-limit store. User query and seller descriptions are untrusted prompt data; no tools, arbitrary URL fetches, or database actions are available. Gemini processing requires appropriate privacy disclosure and approval before production activation. Tests inject fake clients; no live API calls are part of automated verification.
