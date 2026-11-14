# DIGARSA — Project Overview

## Purpose and scope

DIGARSA is a marketplace application for discovering creative services and managing the seller, booking, and administrative workflows associated with those services. This description reflects the repository's implemented structure; it is not a claim based on market research or user validation.

The system includes a React web frontend and an Express/TypeScript backend. The backend provides authentication, public catalog and creator data, seller preparation and service management, saved items, booking lifecycle operations, moderation, and several administrative workflows. Some domain capabilities exist only in backend routes or remain local/demo-only in the frontend, so feature presence in one layer does not imply an end-to-end integration.

## Actors

| Actor | Representation | Main capabilities |
|---|---|---|
| Customer | Authenticated `User` with `Role.USER` | Browse public catalog and creators, manage favorites/cart, and use supported account and booking workflows. |
| Seller | `User` with an associated `SellerProfile` | Prepare profile, portfolio, and services; submit activation review; use approved-seller operations when approval gates are satisfied. Seller is a capability/profile, not a distinct `Role` enum value. |
| Administrator | Authenticated `User` with `Role.ADMIN` | Review seller activation, moderate services/reports/cancellations, and administer dispute, appeal, and revision-assistance workflows through backend routes. |

## Main capabilities found in source

- Public categories, services, creator profiles, search/filtering, and catalog facets.
- Account registration/login, current-user profile, password/session operations, and recovery endpoints.
- Seller profile, portfolio, activation review, service and availability management.
- Server-backed favorites and cart rows.
- Booking validation and booking lifecycle operations, delivery cycles, revisions, cancellation requests, and dispute/appeal workflows.
- Review, conversation, notification, report, and demo-payment route families.

The above list is a backend capability inventory, not a claim that every capability is connected to the frontend or usable against a live deployment. The current frontend feature status and test boundaries are summarized in [Testing and Known Limitations](08-testing-and-known-limitations.md) and the [Project Documentation Audit](../PROJECT_DOCUMENTATION_AUDIT.md).

## Important product boundaries

- Public service visibility is controlled by several backend gates: active, not hidden, moderation-approved, active category, and approved seller.
- Seller activation is a non-identity review of profile, portfolio, and service-offer snapshots. Legacy identity-verification schema/routes must not be described as an active seller requirement.
- Cart entries do not reserve availability and do not create a booking.
- Demo-payment endpoints are not a payment gateway, QRIS settlement, or proof of money movement.
- The source audit does not establish production readiness.

## Evidence

Primary source inventory: [Project Documentation Audit](../PROJECT_DOCUMENTATION_AUDIT.md). Backend implementation is under `src/`; the frontend working application inspected by the audit is `frontend_fix/frontend`.
