# DIGARSA — Business Workflows

This document distinguishes backend source capability from frontend integration and runtime proof. See the [Project Documentation Audit](../PROJECT_DOCUMENTATION_AUDIT.md) for route and implementation evidence.

## Customer

Customers register/login, restore their account through `/api/auth/me`, browse public services/creators, and can store favorites/cart through authenticated APIs. The cart is saved state only; it does not reserve a slot or create a booking. Customer account/profile APIs and parts of catalog/saved-item integration exist in the frontend. Messaging, review, notification and some other experiences remain local/demo or not fully verified according to the frontend feature matrix.

## Seller profile, activation, and service preparation

A user applies for a seller profile, prepares profile/portfolio/service offers, then submits a non-identity activation review. The review captures snapshots and a hash. An admin can approve/reject; rejection requires validated feedback. The seller may withdraw where state rules allow. Profile/portfolio/service preparation and activation-status UI have API integration; administration UI is not complete for all review workflows.

Approved seller status and service moderation are independent gates. A seller may prepare services before approval, but public catalog output requires the service to be active, visible, moderation-approved, in an active category, and owned by an approved seller.

## Service and availability management

Seller service CRUD is scoped to the seller owner. Operational status/visibility and availability operations use approved-seller gates where declared. Availability slots are associated with a seller and service. The frontend Seller Center uses backend APIs for service management, availability, and the three revision-policy inputs; no localStorage persistence is intended for these server-owned resources.

## Booking lifecycle

The customer first asks the backend to validate service/booking eligibility and policy acknowledgement. Booking creation is server-owned for price and state. The seller may accept, decline, and deliver through guarded routes. Customer completion is accepted only when server-side state, deadlines, and blockers allow. Cancellation creates a reason/evidence request for administrative review; that decision does not automatically trigger refund or payout.

Delivery cycles, job claims, receipts and timer records coordinate repeat delivery/review cycles in backend source. The scheduler is guarded for controlled local runs using `BOOKING_SCHEDULER_ENABLED=false`. Full current end-to-end booking runtime is not verified comprehensively.

## Revision and admin assistance

Standard revision requests, clarifications, seller responses/delivery, quota events, and receipts are server-side lifecycle operations. Additional paid revision is a separate offer/agreement workflow; trusted payment execution is not established.

**Response-clock rule:** Customer/seller response deadlines pause while revision admin assistance is `OPEN` or `IN_REVIEW`. The system stores the remaining milliseconds and, after assistance reaches `RESOLVED` or `CLOSED`, resumes with exactly that remaining time if no other blocker remains. It does not restart the full duration. This behavior is supported by source that records pause remainder and restored deadline; all concurrency cases are not thereby proven at runtime.

## Disputes, appeals, reviews, and conversations

Disputes are created/read by booking parties and reviewed/decided by admins. Clarification/evidence and appeal records are part of the backend workflow. Admin decisions do not imply automatic financial state changes. Review creation is constrained by booking eligibility and ownership. Conversation/message handlers enforce participant ownership. Backend route/model presence does not mean complete frontend integration; formal dispute/appeal/admin-assistance UI is unavailable in the current feature matrix, and messaging/reviews have local/demo frontend components.

## Payment and moderation

The backend includes explicit demo-payment routes and payment-related models. These are not a trusted gateway/QRIS integration, settlement, refund, or payout. Admin cancellation/dispute actions do not themselves change financial state. Service moderation is separately managed through admin routes and remains an independent public visibility gate.
