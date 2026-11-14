# Recommendations API

`GET /api/v1/recommendations` returns real, public catalog services from Prisma. The current source is explicitly `rule_based`; no AI provider is configured or called.

Optional query parameters are `category`, `max_budget`, `city`, `query`, and `limit` (1–50, default 10). Category, budget, and city are ranking preferences. `query` narrows candidates using public service title, description, category, creator name, and specialties.

## Eligibility and bounds

The controller requires `visibleCatalogWhere` and `status: OPEN` before ranking, requests at most 250 rows, and maps each result with the existing `toPublicService()` mapper. Thus public DTO privacy and visibility rules remain shared with the catalog. A preference cannot make a hidden, unapproved, unverified, suspended-account, or full-book service eligible.

## Deterministic ranking

Initial relative weights are category 30%, budget 25%, location 20%, rating confidence 20%, and query relevance 15%. Supplied preference dimensions are normalized over their active weights. Rating confidence shrinks small-sample ratings toward a neutral score of 50, using `review_count / (review_count + 5)`. Missing ratings and seller city receive neutral scores. Ties use newest creation date and then ascending service ID. If no preferences are supplied, rating confidence and deterministic tie-breakers provide the cold-start order.

Explanations are derived from actual service category, price, seller city, and persisted ratings. Responses add `recommendation.score`, `recommendation.explanation`, and `recommendation.ranking_source` without changing catalog service fields.

## Future provider integration

`RecommendationProvider` is the integration boundary for a future model. It accepts only bounded eligible candidate IDs and minimal preference/query context. Its output must pass `validateProviderResults`, which discards IDs absent from the candidate set and duplicate IDs. Any later provider must use server-side credentials, strict timeouts and usage limits, minimize personal data, and fall back to deterministic ranking on failure. Provider explanations remain untrusted and should be checked against service attributes before display. No API key or paid provider is required by this baseline.
