# Data contracts and proposed normalized persistence

**Confirmed DTOs** are existing frontend shapes; **Proposed tables** below are design recommendations, not migrations or an existing database. Messaging/review snake_case is already contractual. Other snake_case is an explicit proposed adapter mapping. Do not send private storage envelopes over HTTP.

## Conventions and enums

Proposed `ID` = opaque immutable string, maximum 200 characters, matching current messaging/review identifier alphabet (alphanumeric first, then alphanumeric/underscore/hyphen). Database-generated UUID-backed strings are compatible; do not assume existing prefixed IDs are bare UUIDs. `TS` = timezone-aware instant, serialize canonical ISO UTC. `DATE` = canonical YYYY-MM-DD, not an instant. `TIME` = HH:mm local planning time. `money` = integer IDR, not floating point or payment balance. Currency is IDR throughout existing services.

`R` = required/non-null; `N` = nullable. Proposed foreign keys restrict deletion by default. Use soft deletion for referenced business records. Add explicit row revision (`integer R`, monotonic) on mutable records for concurrency; revisions do not currently exist in demo records and are transport metadata, not extra messaging contract fields.

| Domain | Confirmed values |
| --- | --- |
| Account capabilities | `buyer`; additionally `seller` only with owned profile |
| Permission | `admin:access` independently |
| Category | `Branding`, `Fotografi & Film`, `Web & Digital`, `Illustration & Motion` |
| Booking status | `Requested`, `Accepted`, `Paid`, `Completed`, `Declined`, `Cancelled` |
| Service delivery / booking delivery | `Remote` or `Onsite` / `remote` or `onsite` (case differs intentionally) |
| Availability | `Open`, `Full-book` |
| Notification type | `new_message`, `booking_requested`, `booking_accepted`, `booking_declined`, `booking_completed`, `new_review` |
| Public location visibility | `hidden`, `area`, `pin` |
| Private location source | `city`, `manual`, `geolocation` |

## Explicit existing camelCase mappings

| Existing frontend field | Proposed API/database field | Meaning |
| --- | --- | --- |
| `user.id`, `name`, `email` | `id`, `name`, `email` | Same identity/display |
| `avatarUrl`, `birthDate`, `createdAt` | `avatar_url`, `birth_date`, `created_at` | Account fields |
| `phone`, `gender` | Same spelling | Optional profile strings |
| `sellerProfileId` | `seller_profile_id` | Derived account projection, not independent source of ownership |
| `ownerUserId` | `owner_user_id` | Seller/service account owner |
| `profile.image`, `portfolioLink` | `image_url`, `portfolio_link` | Seller profile media/link |
| `publicLocation` | `public_location` | Public profile projection/location relation |
| `serviceLocation` | `service_location` | Nullable service override; null means inheritance |
| `discoveryLocation` | `discovery_location` | Private preference, separate authenticated endpoint |
| `service.creatorId`, `booking.creatorId` | `seller_profile_id` | Never an account ID |
| `service.image`, `active`, `delivery` | `image_url`, `active`, `delivery` | Service write model |
| `booking.customerId`, `serviceId` | `customer_user_id`, `service_id` | Booking associations |
| `serviceTitle`, `creatorName` | `service_title`, `seller_name` | Historical booking snapshots |
| `estimatedPrice`, `deliveryMode` | `estimated_price`, `delivery_mode` | Historical estimate/mode |
| `requestedDate`, `declineReason`, `updatedAt` | `requested_date`, `decline_reason`, `updated_at` | Booking fields |
| `startTime`, `endTime` | `start_time`, `end_time` | Schedule slot |
| `list.userId` | `user_id` | Favorites/cart owner |
| Moderation `{reason,at,by}` | `reason`, `moderated_at`, `moderator_user_id` | Existing hidden entry; restore removes it |

No renaming of established Conversation, Message, Notification or Review keys is proposed. IDR values remain numbers within JavaScript safe-integer limits. Optional demo empty strings should normalize to nullable database values with an explicit adapter back to current form defaults.

## Confirmed account and catalog projections

`current()` returns `{id,name,email,avatarUrl,phone,birthDate,gender,createdAt,sellerProfileId,capabilities,permissions}`. Legacy creation dates may be null; do not invent them. Credentials, session internals and saved buyer coordinates are excluded. Account profile input accepts only name/avatarUrl/phone/birthDate/gender, not email, IDs or permissions.

Seller Profile record: `{id,ownerUserId,name,category,city,bio,image,portfolioLink,specialties,publicLocation?}`. `specialties` is an array after comma-separated form normalization. Public profile city remains intentionally public even when pin visibility is hidden.

Seller service record: `{id,ownerUserId,creatorId,title,category,description,price,delivery,turnaround,availability,image,active,serviceLocation?,createdAt,updatedAt}`. Public catalog derives studio/name, images, alt text and `publicLocation`; it does not expose booking briefs. Proposed public service DTOs must exclude the raw `service_location` override and use sanitized `public_location` only (hidden → null); raw ownership/location write records are owner-only. Editorial creator records have fields such as role/skills/portfolio without an owned account. They must remain distinguishable from legitimate seller profiles and never become bookable by assigning a fictional account owner.

## Confirmed presentation-only catalog data

Public service shape in `frontend/src/data/marketplace.js` / `frontend/src/features/seller/sellerCatalog.js`: `id,title,category,studio,creatorId,price,availability,delivery,turnaround,description,image,alt,images:[{src,alt}],reviews`, and optional derived `publicLocation`. Editorial projects may also carry decorative project metadata from home data. Seller write records do not accept a gallery array: their one image produces one gallery entry with fallback art/alt text. Static editorial services currently have multiple example images.

Public creator shape: `id,name,role,city,image,description,bio,skills,portfolioLink,portfolio:[{image,alt,title,serviceId}]` and optional sanitized publicLocation; seller overlay also carries ownerUserId internally. Proposed public HTTP creator DTO omits owner_user_id and exposes only intentional public identity. role derives profile category, skills from specialties (category fallback), description is bio clipped to120, portfolio is recomputed from visible services. Do not invent an independent uploaded-portfolio CRUD workflow.

Proposed mappings: `images[].src` stays `images[].src` (image URL), `alt` stays `alt`, `portfolio[].serviceId` becomes `portfolio[].service_id`, `portfolio[].image` becomes `portfolio[].image_url`; gallery/portfolio are public derived read models. `reviews:[{id,name,score,text}]` in static catalog is **illustrative testimonials**, not the verified Review schema or rating source. If retained, expose them under an explicit illustrative namespace, never `/reviews`. Homepage editorial copy/assets can remain static until a content-management decision.

Optional Proposed persistence for curated gallery metadata, if approved: `service_images(id ID R PK, service_id ID R FK services, position integer R, src varchar(2048) R, alt text R)` with unique(service_id,position). This is read-content support, not an implied upload endpoint or expanded seller form. A service's existing image_url can supply the single entry without this table. Media ownership/storage/curation remains an open decision.

## Proposed tables

Every listed column has explicit type/nullability. Constraints following each table are part of the proposal.

### users and private account preferences

| Table | Column | Type | Nullability / relation |
| --- | --- | --- | --- |
| users | id | ID | R PK |
| users | name | varchar(80) | R |
| users | email | varchar(254) | R normalized unique |
| users | created_at | TS | R for new users; legacy unknown import decision |
| users | updated_at | TS | R |
| account_profiles | user_id | ID | R PK/FK users |
| account_profiles | avatar_url | varchar(2048) | N |
| account_profiles | phone | varchar(25) | N private |
| account_profiles | birth_date | DATE | N private |
| account_profiles | gender | varchar | N existing localized enum |
| account_profiles | updated_at | TS | R |
| account_permissions | user_id | ID | R FK users |
| account_permissions | permission | varchar | R allowlisted value |
| account_permissions | granted_at | TS | R |
| account_permissions | granted_by_user_id | ID | N FK users (trusted bootstrap may have no actor) |
| buyer_locations | user_id | ID | R PK/FK users |
| buyer_locations | version | integer | R fixed 1 |
| buyer_locations | city | varchar(120) | R, may be empty for coordinate-based choice |
| buyer_locations | latitude | decimal | N paired with longitude |
| buyer_locations | longitude | decimal | N paired with latitude |
| buyer_locations | source | enum | R private source enum |
| buyer_locations | consent | boolean | R |
| buyer_locations | saved_at | TS | R server-recorded; new metadata |

Unique `(user_id,permission)`; index permission/user for admin checks. No registration role column. Seller capability derives from seller_profiles. Private buyer latitude/longitude are owner-only, never joined into public catalog/admin list DTOs. Coordinate validation/consent pairing is specified in [reviews-locations.md](reviews-locations.md). Clearing removes the preference, not the account.

**Proposed authentication infrastructure:** private server credential and session repositories, separate from public DTOs. Internal credential material is intentionally not modeled as a handoff public record. Use a maintained server password-hashing implementation; opaque server sessions, expiry/revocation, secret management and trusted admin provisioning need team approval. Do not migrate demo verifiers. No credential/session token examples belong in this document.

### Seller profiles and public locations

| Table | Column | Type | Nullability / relation |
| --- | --- | --- | --- |
| seller_profiles | id | ID | R PK |
| seller_profiles | owner_user_id | ID | R unique FK users |
| seller_profiles | name | varchar(80) | R |
| seller_profiles | category | enum | R category enum |
| seller_profiles | city | varchar(80) | R intentionally public |
| seller_profiles | bio | varchar(500) | R |
| seller_profiles | image_url | varchar(2048) | N |
| seller_profiles | portfolio_link | varchar(2048) | N |
| seller_profiles | public_location_id | ID | N FK public_locations |
| seller_profiles | created_at | TS | R proposed, not currently stored in demo profile |
| seller_profiles | updated_at | TS | R proposed |
| seller_specialties | seller_profile_id | ID | R FK seller_profiles |
| seller_specialties | position | integer | R nonnegative |
| seller_specialties | label | text | R |
| public_locations | id | ID | R PK |
| public_locations | version | integer | R fixed 1 |
| public_locations | visibility | enum | R hidden/area/pin |
| public_locations | area | varchar(120) | R empty only when hidden |
| public_locations | latitude | decimal | N pair |
| public_locations | longitude | decimal | N pair |
| public_locations | confirmed | boolean | R |
| public_locations | updated_at | TS | R proposed |

Unique `(seller_profile_id,position)`. Public locations belong to one profile or one service override; prevent shared mutable location references across owners. Hidden rows project to null. No exact-point inference from area/city. Use separate fields/table semantics for private buyer points; never reuse a buyer location row as a public location. Geospatial index on confirmed pin points is Proposed, database-specific.

### Services, planning schedules and moderation

| Table | Column | Type | Nullability / relation |
| --- | --- | --- | --- |
| services | id | ID | R PK |
| services | seller_profile_id | ID | R FK seller_profiles |
| services | title | varchar(100) | R |
| services | category | enum | R |
| services | description | varchar(1500) | R |
| services | price | integer money | R |
| services | delivery | enum | R Remote/Onsite |
| services | turnaround | varchar(60) | R descriptive estimate |
| services | availability | enum | R Open/Full-book |
| services | image_url | varchar(2048) | N |
| services | active | boolean | R |
| services | service_location_id | ID | N FK public_locations; null inherits profile |
| services | created_at, updated_at | TS each | R each |
| services | deleted_at | TS | N proposed tombstone |
| service_schedules | id | ID | R PK |
| service_schedules | service_id | ID | R FK services |
| service_schedules | date | DATE | R |
| service_schedules | start_time, end_time | TIME each | R each |
| service_schedules | note | varchar(160) | R empty allowed |
| service_schedules | created_at, updated_at | TS each | R each |
| service_moderation | service_id | ID | R PK/FK services |
| service_moderation | reason | varchar(300) | R when hidden |
| service_moderation | moderator_user_id | ID | R FK users with admin permission |
| service_moderation | moderated_at | TS | R |

Service owner_user_id is derived through profile, not duplicated as independent writable ownership; adapters can supply the current demo field. The same applies to schedule owner/creator fields. Index services `(seller_profile_id,created_at,id)` and discovery fields `(active,availability,category,price,id)`; planning `(service_id,date,start_time)`. Transactional overlap check for one service/date; start < end, adjacent intervals allowed. No booking slot/capacity FK exists today. `requiresSchedule` is recognized by booking validation, but is not produced by the current seller service form/store; decide whether to standardize it before exposing a write field.

Moderation absence = visible; presence = hidden. Restore removes current hidden state; append-only audit history is Proposed. Index moderator/time for audit. Admin can moderate baseline editorial services today. **Needs confirmation:** migrate editorial examples into a separate `editorial_content` collection or explicitly nonbookable catalog representation; do not satisfy services' mandatory seller FK with dummy users. API catalog may combine labeled editorial display DTOs and legitimate services; only the latter support transactions. Physical demo deletion and Proposed backend tombstones differ deliberately to retain historical FKs. Active booking protection still applies to delete requests.

### Favorites, cart and bookings

| Table | Column | Type | Nullability / relation |
| --- | --- | --- | --- |
| favorites | user_id, service_id | ID each | R FK users/services each; composite PK |
| favorites | created_at | TS | R proposed metadata |
| cart_entries | user_id, service_id | ID each | R FK users/services each; composite PK |
| cart_entries | created_at | TS | R proposed metadata |
| bookings | id | ID | R PK |
| bookings | customer_user_id | ID | R FK users |
| bookings | seller_profile_id | ID | R FK seller_profiles |
| bookings | service_id | ID | R FK services, retain historical reference |
| bookings | service_title, seller_name | text each | R snapshots each |
| bookings | estimated_price | integer money | R nonnegative snapshot |
| bookings | delivery_mode | enum | R remote/onsite snapshot |
| bookings | requested_date | DATE | N; frontend uses empty string for omitted remote date |
| bookings | location | varchar(500) | N private onsite address/brief, not a geographic pin |
| bookings | requirements | varchar(2000) | R private |
| bookings | description | varchar(5000) | R private |
| bookings | status | enum | R exact booking status |
| bookings | decline_reason | varchar(500) | N private participants/admin monitoring |
| bookings | created_at | TS | R |
| bookings | updated_at | TS | N initially in demo; set on changes |

Index bookings `(customer_user_id,created_at,id)`, `(seller_profile_id,status,created_at,id)`, `(service_id,status)`. No quantity/combined checkout/charged amount/payout field. Add Proposed `booking_status_events(id ID PK, booking_id ID R FK, from_status enum N, to_status enum R, actor_user_id ID N FK, occurred_at TS R, source varchar R)` for immutable transition audit; index `(booking_id,occurred_at,id)`. System/payment actor may be null but authenticated event provenance must be recorded internally. There is no such event history today; never derive historical Accepted/Completed trends from the current status alone.

Favorites/cart may currently retain editorial/removed IDs; production saved-content identity strategy depends on the editorial decision. Do not migrate them blindly through a mandatory service FK. Retain unavailable-item UX and removable stale entries.

### Conversations and messages: exact established public fields

| Table / DTO | Field | Type | Nullability / relation |
| --- | --- | --- | --- |
| conversations | id | ID | R PK |
| conversations | customer_user_id | ID | R FK users |
| conversations | seller_profile_id | ID | R FK seller_profiles |
| conversations | service_id | ID | N FK services |
| conversations | booking_id | ID | N FK bookings |
| conversations | created_at | TS | R |
| conversations | updated_at | TS | R |
| conversations | last_message_at | TS | N |
| messages | id | ID | R PK |
| messages | conversation_id | ID | R FK conversations |
| messages | sender_user_id | ID | R FK users, participant only |
| messages | content | varchar(4000) | R validated plain text |
| messages | created_at | TS | R |
| messages | read_at | TS | N single opposite participant receipt |

Unique context **including nulls** `(customer_user_id,seller_profile_id,service_id,booking_id)`; database default nullable-unique semantics may not enforce this, use an explicit null-safe key/constraint. Validate booking's customer/profile/service associations. Index conversations `(customer_user_id,updated_at,id)` and `(seller_profile_id,updated_at,id)`; messages `(conversation_id,created_at,id)` and incoming unread lookup. No group membership, attachments, edit/delete, online/presence fields or multi-recipient receipts in current contracts.

Proposed `message_requests`: `sender_user_id ID R FK users`, `conversation_id ID R FK conversations`, `client_event_id ID R`, `message_id ID R FK messages`, `payload_fingerprint text R`, `created_at TS R`; unique first three. This maps demo `{key,entity_id}` private indexes, not Message fields. Retention must exceed retry window and prevent replay duplicates; decision required.

### Notifications and event deduplication

| Table / DTO | Field | Type | Nullability / relation |
| --- | --- | --- | --- |
| notifications | id | ID | R PK |
| notifications | recipient_user_id | ID | R FK users |
| notifications | actor_user_id | ID | N FK users |
| notifications | type | enum | R exact six supported types |
| notifications | title | varchar(1000) | R |
| notifications | message | varchar(1000) | R generic safe copy |
| notifications | related_entity_id | ID | N, type-discriminated message/booking/review reference |
| notifications | is_read | boolean | R |
| notifications | created_at | TS | R |

Index `(recipient_user_id,is_read,created_at,id)`. A polymorphic related_entity_id has no ordinary single FK: enforce correct target by type in transaction/service layer or use an internal typed event relation without changing DTO. Proposed private `notification_events`: `event_key text R PK`, `notification_id ID R unique FK notifications`, `created_at TS R`. Dedupe keys and routing are in [messaging-notifications.md](messaging-notifications.md). Proposed outbox: `id ID PK`, `event_key text R unique`, `event_type varchar R`, `entity_id ID R`, `created_at TS R`, `delivered_at TS N`, `attempt_count integer R`. Keep private payload minimal and never include buyer GPS or payment instructions.

### Reviews: exact existing record plus optional edit metadata

| Table / DTO | Field | Type | Nullability / relation |
| --- | --- | --- | --- |
| reviews | id | ID | R PK stable |
| reviews | booking_id | ID | R unique FK bookings |
| reviews | service_id | ID | R FK services |
| reviews | seller_profile_id | ID | R FK seller_profiles |
| reviews | customer_user_id | ID | R FK users |
| reviews | reviewer_name | varchar(200) | R snapshot |
| reviews | service_title | varchar(200) | R snapshot |
| reviews | seller_name | varchar(200) | R snapshot |
| reviews | rating | integer | R 1–5 |
| reviews | comment | varchar(2000) | R trimmed visible-content validation |
| reviews | created_at | TS | R immutable |
| reviews | updated_at | TS | N; omitted from legacy DTO until first edit |

Index `(service_id,created_at,id)`, `(seller_profile_id,created_at,id)`, `(customer_user_id,created_at,id)`. Author updates rating/comment only. Public projection removes booking_id/customer_user_id and adds derived `verified:true`; no permissions/contact/brief fields. `verified` is not a client-writable database flag. Compute aggregates or update a transactional derived view after submit/edit. Summary `{total,average:null|number,distribution:[{rating,count,percentage}]}`; distribution ordered 5→1, empty average null, percentages zero. Demo illustrative testimonials are not rows in this verified table.

## Validation equivalence and integrity

New-write validation is sometimes stricter than demo stored-row validation. Do not assume all legacy rows can be imported into the proposed stricter model. Validate/report migrations explicitly, preserve stable valid associations, quarantine incompatible data without silent loss. Server constraints must recheck actual foreign keys and authorization; existing messaging/review adapters primarily resolve profile owner IDs and are not proof of account existence. Use the stricter account-backed ownership requirement across production modules.

Private structures stay private: account auth records, message retry/event indexes, buyer coordinates, session material and integrity diagnostics. Public responses should never echo complete localStorage records or expose internal failure dumps.
