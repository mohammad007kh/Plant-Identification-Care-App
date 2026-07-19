# Feature Specification: Plant Identification & Care App

**Feature Branch**: `001-plant-id-care-app`
**Created**: 2026-07-19
**Status**: Draft
**Platform**: Web
**Input**: User description: "Plant Identification and Care web app (Plant_ID_App_PRD.md): AI photo-based plant identification with care guides, guest scans, accounts, plant tracking, AI chat, credits/subscriptions, care reminders, and admin panel"

## Lifecycle Markers

<!--
  Script-managed. Do NOT hand-edit. (v0.3+)
  Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1} during
  /atomicspec.specify. Lines appear as authoring starts and ends.
  This artifact carries the AUTHORING lifecycle only — spec.md is never
  "implemented" (Article IX, Directive 9). See `clarify-log.md` for the
  per-session lifecycle of subsequent clarification passes.
  Empty section = legacy / pre-v0.3 artifact, treated as `legacy_closed` (the
  distinct state name in `stamp-lifecycle status` JSON output).
-->


<!--
  NOTE: The Platform field is set during /atomicspec.specify (Phase 0 - Platform Detection).
  All downstream commands (/atomicspec.plan, /atomicspec.build, etc.) will inherit this platform
  setting to ensure consistent platform context throughout the feature lifecycle.

  When Platform = "both", the single Platform field is all that is stored here.
  Do NOT add Platform-Frontend or Platform-Backend fields.
  Downstream commands read the registry for specifics:
    - mobile_framework  → which mobile SDK/framework (React Native, Flutter, etc.)
    - backend.*         → language, framework, ORM, and other backend details
  This keeps the spec contract simple while the registry carries the detail.
-->

<!--
  ============================================================================
  CONSTITUTION ARTICLE IX COMPLIANCE: GATE COMPLIANCE (Directive 4)

  Before this specification can proceed to planning, the following Knowledge
  Station gates MUST be satisfied:

  - Station 03 (Discovery): ICP defined, Wedge defined, JTBD captured
  - Station 04 (PRD): SaaS Rules defined, Acceptance Criteria complete
  - Station 05 (User Flows): Edge State Checklist covered

  This is NON-NEGOTIABLE per the Constitution.
  ============================================================================
-->


- Authored start:        2026-07-19T15:02:55Z by claude:opus-4-8
- Authored end:          2026-07-19T15:07:38Z by claude:opus-4-8

## Clarifications

### Session 2026-07-19

Architectural decisions from a subagent-supervised pre-plan interview (five domain specialists reconciled by a supervisor) were written to `specs/_defaults/registry.yaml` (see its `_provenance` block and `specs/_defaults/changelog.md`). Product-affecting resolutions:

- Q: How will the app reach and pay for the AI model from Iran? → A: Use **OpenAI**, orchestrated with **LangChain + LangGraph**, behind a swappable `PlantAIProvider` abstraction. Iran reachability is accepted as the founder's responsibility.
- Q: Transactional email path (Western APIs may geoblock Iran)? → A: **Iranian SMTP relay** on an owned domain (SPF/DKIM/DMARC), behind a `MailPort`. Email is the primary reminder/verification channel; web push is best-effort/secondary.
- Q: Authentication rails for v1? → A: **Email/password only.** Google sign-in is **deferred** (unreliable from Iran). _This overrides the PRD, which listed Google sign-up/login as P0._
- Q: How are credits sold in v1? → A: **Subscription tier allowance only** (Free/Pro/Max monthly credits); no standalone credit top-ups in v1. The credit ledger stays generic so top-ups can be added later.
- Confirmed compliance scope: Iran-only market, no EU users → **out of GDPR scope**; mock payments, no cardholder data handled directly → **out of PCI scope**.

## User Scenarios & Testing _(mandatory)_

**Ideal Customer Profile (ICP)**: Everyday plant owners in Iran (Persian-speaking) who have one or more houseplants and want fast, reliable answers about what a plant is and how to keep it healthy — spanning casual owners of a single new plant and more engaged enthusiasts who want to track plant health over time.

**Anti-ICP (who this is NOT for in v1)**: Professional botanists needing lab-grade taxonomic precision; commercial nurseries/agriculture operations; international users needing non-Persian languages or non-Zarinpal payment; users needing offline/field use without connectivity.

**Wedge (entry-point value)**: Snap a photo of a leaf and instantly get the plant's identity plus an actionable care guide — no login, no searching multiple sites.

### User Story 1 - Identify a plant from a leaf photo (Priority: P1)

A visitor arrives with a plant they can't identify, uploads or takes a photo of a leaf, and receives the plant's species name and a structured care guide — without needing to create an account first.

**Why this priority**: This is the core value proposition and the product's wedge. If only this ships, the app already delivers standalone value and is a viable MVP.

**Independent Test**: Open the app as an unauthenticated visitor, submit a clear leaf photo of a supported species, and confirm a species name plus a structured care guide is displayed when confidence is sufficient.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor on the app, **When** they submit a clear leaf photo and the AI returns confidence ≥ 70%, **Then** the system displays the identified species name and a structured care guide.
2. **Given** an unauthenticated visitor, **When** they submit a photo and the AI returns confidence < 70%, **Then** the system shows a low-confidence message asking for a clearer/better photo and does not display any species result.
3. **Given** a visitor on the upload screen, **When** they attempt to submit a non-image file (e.g., a video), **Then** the system rejects it with a clear error message and does not consume a scan.
4. **Given** a visitor whose scan is being processed, **When** the AI service is working, **Then** the system shows a loading/in-progress state until a result or error is returned.

---

### User Story 2 - Register after the free guest limit and keep prior scans (Priority: P2)

After using their free guest scans, a visitor is prompted to create an account; upon registering (email/password), every scan they performed as a guest in that session is saved and linked to their new account.

**Why this priority**: Converts anonymous value into retained users and unlocks all account-based features. Depends on P1 producing scan results worth keeping.

**Independent Test**: As a guest, perform the allowed number of scans, trigger the registration wall on the next attempt, complete registration, and confirm all prior guest scans appear in the new account's profile.

**Acceptance Scenarios**:

1. **Given** a guest who has completed 2 scans, **When** they attempt a 3rd scan, **Then** the system presents a registration wall instead of performing the scan.
2. **Given** a guest at the registration wall, **When** they register via email + password, **Then** an account is created and they are signed in.
3. **Given** a guest at the registration wall, **When** they view the available sign-in options, **Then** only email/password registration is offered (no third-party/Google login in v1).
4. **Given** a guest who performed scans this session, **When** they complete registration, **Then** all of those prior guest scans appear saved and linked in their profile.

---

### User Story 3 - Save plants and view photo history in a profile (Priority: P2)

A registered user keeps a personal collection of identified plants, each with its own photo history, so they can revisit identifications and care guidance over time.

**Why this priority**: Turns one-off identification into an ongoing relationship and is the foundation for tracking, comparison, and reminders. Requires accounts (P2) to exist.

**Independent Test**: As a registered user, scan and save a plant, then open the profile and confirm the plant is listed with its associated photo(s) and care guide.

**Acceptance Scenarios**:

1. **Given** a registered user who has identified a plant, **When** they save it, **Then** the plant appears in their plant list.
2. **Given** a registered user with saved plants, **When** they open a saved plant, **Then** they see its photo history and care guide.
3. **Given** a registered user with no saved plants yet, **When** they open their profile, **Then** they see an empty-state prompt guiding them to scan their first plant.

---

### User Story 4 - Subscription tiers with a unified AI credit system (Priority: P2)

Every AI-powered action (scan, chat message, comparison) draws from a monthly credit balance tied to the user's subscription tier (Free, Pro, Max). When credits run out, the user is shown a modal listing available paid plans (fetched live from the plan database) and can upgrade via a mock payment flow. If an AI action fails due to a service error, the consumed credit is refunded and the user is invited to retry.

**Why this priority**: Governs usage of every AI feature and is the monetization backbone. It must exist before chat, comparison, and heavy scan usage are meaningful, but after core scanning and accounts.

**Independent Test**: As a user with a known credit balance, perform AI actions to exhaust credits, confirm the upgrade modal shows live plan data, complete a mock upgrade, and separately confirm a simulated AI failure leaves the credit balance unchanged.

**Acceptance Scenarios**:

1. **Given** a user with available credits, **When** they perform an AI-powered action (scan, chat, or comparison), **Then** their visible credit balance decreases by the configured amount for that action.
2. **Given** a user with insufficient credits, **When** they attempt any AI-powered action, **Then** a modal appears listing the currently configured paid plans (from the database, not hardcoded) with a purchase call-to-action, and the action is not performed.
3. **Given** a user in the upgrade modal, **When** they complete the mock Zarinpal checkout, **Then** their subscription tier is updated and no real financial transaction occurs.
4. **Given** a user who performs an AI action that fails due to a service error, **When** the failure is detected, **Then** the previously consumed credit is refunded (balance unchanged from before the attempt) and a "please try again" message is shown.
5. **Given** an admin has changed a tier's monthly credit allowance, **When** a user's billing cycle renews (or a new subscriber joins that tier), **Then** the updated allowance applies without a code deployment.

---

### User Story 5 - Track a plant's health with follow-up photo comparison (Priority: P3)

A registered user uploads a new photo of a plant they already saved; the photo is added to that plant's history and the AI compares it against prior photo(s), reporting whether the plant appears improved, worse, or unchanged.

**Why this priority**: A retention/engagement enhancer for engaged owners, valuable but not required for the core wedge. Depends on saved plants (P3 builds on P2/P3) and the credit system (P2).

**Independent Test**: As a registered user with a previously saved plant, upload a new photo of that same plant and confirm it joins the plant's history and a health-trend result referencing recent photos is returned.

**Acceptance Scenarios**:

1. **Given** a registered user with a saved plant, **When** they upload a new photo against that plant, **Then** the photo is added to that plant's history and is not treated as a new plant.
2. **Given** a saved plant with at least two photos, **When** a comparison runs, **Then** the system returns a health-trend result (improved/worse/unchanged) referencing at least the two most recent photos.
3. **Given** a user with insufficient credits, **When** they attempt a comparison, **Then** the credit-exhaustion flow (upgrade modal) is triggered instead.

---

### User Story 6 - Chat with the AI about a specific plant (Priority: P3)

A registered user asks the AI questions about one of their saved plants (e.g., "why are the leaves turning yellow?"), with up to 2 plant photos as context and a limited number of free messages before the credit paywall applies.

**Why this priority**: Deepens the care experience for engaged users; valuable add-on that relies on saved plants (P2/P3) and the credit system (P2).

**Independent Test**: As a registered user, open a chat on a saved plant, exchange messages, and confirm each message consumes credit and that exceeding the free message allowance triggers the credit-exhaustion flow.

**Acceptance Scenarios**:

1. **Given** a registered user viewing a saved plant, **When** they start a chat, **Then** they can send messages about that plant with up to 2 of its photos included as context.
2. **Given** a user in a plant chat, **When** they send a message, **Then** their visible credit balance decreases.
3. **Given** a Free-tier user who has used their free message allowance (10 messages), **When** they send the next message beyond available credit, **Then** the credit-exhaustion flow (upgrade modal) is triggered.

---

### User Story 7 - Receive and control care reminders (Priority: P3)

A registered user receives care reminders (e.g., watering) for their saved plants via email and push notification on a system-predicted schedule, and can turn notifications on or off in their settings.

**Why this priority**: Drives long-term retention through timely nudges; depends on saved plants (P2/P3) and is not needed for the core value.

**Independent Test**: For a saved plant with a predicted schedule, confirm a reminder is delivered on the predicted date via the enabled channels, and that disabling notifications stops future reminders for that user.

**Acceptance Scenarios**:

1. **Given** a saved plant with a system-predicted care schedule, **When** the predicted reminder date arrives, **Then** a reminder is delivered to the user via email and push notification.
2. **Given** a user with notifications enabled, **When** they disable notifications in their settings, **Then** future reminders are no longer sent to them.
3. **Given** an admin has edited a notification template or its timing, **When** future reminders are generated, **Then** they reflect the updated template/schedule.

---

### User Story 8 - Request account deletion with a grace period (Priority: P3)

A registered user requests deletion of their account; the account enters a 7-day grace period during which the request can be cancelled, after which all associated data is permanently and completely removed.

**Why this priority**: A trust/compliance-supporting capability required for a complete, respectful product, but not part of day-one core usage.

**Independent Test**: As a registered user, submit a deletion request, confirm data is not immediately removed and the request can be cancelled within the window, and confirm complete removal after the grace period elapses.

**Acceptance Scenarios**:

1. **Given** a registered user in account settings, **When** they submit a deletion request, **Then** the account enters a 7-day grace period and data is not immediately removed.
2. **Given** an account within its 7-day grace period, **When** the user cancels the deletion request, **Then** the account and its data are retained and fully usable.
3. **Given** an account whose 7-day grace period has elapsed without cancellation, **When** deletion completes, **Then** no data associated with that account remains in the system.

---

### User Story 9 - Administer the product via an admin panel (Priority: P3)

An admin (initially the founder) maintains the plant database, reviews misidentification reports, manages user accounts, and configures operational settings (per-tier credit allowances, notification templates/timing, and allowed photo file types) without code changes.

**Why this priority**: Essential for operating and correcting the product, but internal-facing and not part of the end-user core flow.

**Independent Test**: As an admin, edit a species care guide, review a submitted misidentification report, and change a configurable setting (e.g., allowed file types or a tier's credit allowance), then confirm each change takes effect for users without a deployment.

**Acceptance Scenarios**:

1. **Given** an admin in the plant database view, **When** they edit a species' care guide, **Then** the updated care guide is reflected in future identification results for that species.
2. **Given** a user has submitted a misidentification report, **When** an admin opens the reports view, **Then** the report appears with the associated photo and AI result.
3. **Given** an admin managing users, **When** they search for a specific user, **Then** they can locate that account and view its status.
4. **Given** an admin changes allowed photo file types, **When** a user next uploads a photo, **Then** the upload validation reflects the new allowed formats immediately.
5. **Given** an admin changes a tier's credit allowance or a notification template/timing, **When** the change is saved, **Then** it applies to subsequent user-facing behavior without a code deployment.

---

### Edge Cases

- **Non-image / oversized upload**: Uploading a non-image file or a file of a disallowed type is rejected with a clear error and does not consume a scan or credit.
- **Low-confidence result (<70%)**: No species is ever shown; the user is guided to submit a better photo. (Exact retry-count and wording are a design detail — see Assumptions.)
- **Guest limit boundary**: The 2nd scan still succeeds; the 3rd attempt triggers the registration wall. Guest scan attribution across a session is a product expectation (all transfer on registration) — the technical identifier is deferred to planning.
- **Credit exhaustion mid-action**: An AI action attempted with insufficient credit is blocked before execution and the upgrade modal is shown; the action is not partially performed.
- **Paid-tier users hitting their limit**: Pro/Max users who exhaust their monthly credits see the same upgrade/available-options modal as Free users (see Assumptions).
- **AI service failure**: Any consumed credit is refunded and the user is invited to retry; the failure does not leave the balance reduced.
- **Comparison with only one prior photo**: If a plant has fewer than two photos, the system cannot produce a trend and should communicate that a follow-up photo is needed rather than returning a misleading trend.
- **Chat context limit**: No more than 2 photos are included as context for a plant chat.
- **Notifications disabled**: With notifications off, no reminders are sent regardless of predicted schedule.
- **Deletion during grace period**: Cancelling within 7 days fully restores the account; after 7 days data is irrecoverable.
- **Connectivity loss**: The app requires an active connection; there is no offline mode, so actions requiring the AI service or backend fail gracefully with a retry prompt.
- **Empty states**: New accounts with no plants, chats, or reminders show guiding empty states rather than blank screens.

## Requirements _(mandatory)_

### SaaS Rules

- **Tenancy boundary**: Data is isolated per user account. A user's plants, photos, chat messages, credit balance, and notification preferences are private to that account; no cross-user or organization-level sharing exists in v1. Guest activity is scoped to an anonymous session until it is transferred to a newly created account.
- **Roles / RBAC**: Three roles — **Guest** (unauthenticated; up to 2 scans, no persistence), **Registered User** (full end-user features on their own data), and **Admin** (single role with full access to plant database, misidentification reports, user management, and operational configuration). No granular admin sub-roles in v1.
- **Limits / meters**: Guests limited to 2 scans. All AI actions (scan, chat message, comparison) consume from a monthly credit balance determined by tier (Free, Pro, Max). Free-tier plant chat allows up to 2 context photos and 10 free messages before the credit paywall applies. Credit costs per action and per-tier allowances are admin-configurable.
- **Billing impact**: Payment is via a mock Zarinpal gateway in v1 (no real transaction). Credit exhaustion presents an upgrade modal with live plan data. AI service failure refunds the consumed credit. Tier changes take effect for new/renewing billing cycles without a deployment.

## Functional Requirements

**Plant Identification**

- **FR-001**: System MUST accept a single image upload (image formats only; no video) for identification.
- **FR-002**: System MUST send the submitted photo to an AI identification service and return the plant's species identity and a structured care guide in a consistent format on success.
- **FR-003**: System MUST present an identification result only when AI confidence is ≥ 70%; when confidence is < 70%, it MUST show a low-confidence prompt and MUST NOT display any species result.
- **FR-004**: System MUST reject uploads that are not of an allowed image type with a clear error message, without consuming a scan or credit.
- **FR-005**: Admins MUST be able to configure the allowed photo file types/formats, and changes MUST take effect on subsequent uploads without a code deployment.

**Guest & Account Access**

- **FR-006**: System MUST allow a guest exactly 2 scans before requiring registration; the 3rd attempt MUST present a registration wall instead of scanning.
- **FR-007**: Users MUST be able to register and log in via email + password. Third-party (Google) sign-in is deferred beyond v1 (see Clarifications 2026-07-19); the auth layer SHOULD be structured to admit an additional login provider later without a rebuild.
- **FR-008**: Upon registration, System MUST save and link all scans the user performed as a guest in that session to the new account.

**Plant Tracking & Comparison**

- **FR-009**: Registered users MUST be able to save identified plants to their profile, each with its own photo history.
- **FR-010**: Registered users MUST be able to upload a new photo against an existing saved plant, adding it to that plant's history rather than creating a new plant.
- **FR-011**: System MUST compare a new photo against prior photo(s) of the same plant and return a health-trend result (improved / worse / unchanged) referencing at least the two most recent photos; when fewer than two photos exist, it MUST indicate a follow-up photo is needed instead of returning a trend.

**AI Chat**

- **FR-012**: Registered users MUST be able to chat with the AI about a specific saved plant, with up to 2 of that plant's photos included as context.
- **FR-013**: System MUST limit Free-tier plant chat to 10 free messages before the credit paywall applies, and each chat message MUST consume credit from the user's monthly balance.

**Subscriptions & Credits**

- **FR-014**: System MUST support three subscription tiers (Free, Pro, Max), each with an admin-configurable monthly credit allowance.
- **FR-015**: System MUST deduct credit from the user's monthly balance for every AI-powered action (scan, chat message, comparison) by the configured amount for that action.
- **FR-016**: When a user has insufficient credit for an action, System MUST block the action and display a modal listing the currently configured paid plans (fetched from the database, not hardcoded) with a purchase call-to-action.
- **FR-017**: When an AI-powered action fails due to a service error, System MUST refund the consumed credit (leaving the balance unchanged from before the attempt) and show a retry message.
- **FR-018**: System MUST process payments through a mock gateway (Zarinpal as the simulated provider) for v1; completing a mock checkout MUST update the user's subscription tier without any real financial transaction.
- **FR-019**: System MUST apply admin changes to a tier's credit allowance to new and renewing billing cycles without a code deployment.

**Notifications**

- **FR-020**: System MUST send care reminders (e.g., watering) for saved plants via email and push notification based on a system-predicted per-plant schedule.
- **FR-021**: Admins MUST be able to configure notification templates and their timing/schedules, and changes MUST apply to future notifications.
- **FR-022**: Users MUST be able to enable or disable their own notifications; disabling MUST stop future notifications to that user.

**Account & Data Management**

- **FR-023**: Users MUST be able to request account deletion; deletion MUST be deferred through a 7-day grace period, MUST be cancellable by the user during that window, and after the window MUST result in complete, permanent removal of all associated data.

**Admin Panel**

- **FR-024**: Admins MUST be able to view and edit the plant database (species information and care guides), with edits reflected in future identification results for that species.
- **FR-025**: Admins MUST be able to view user-submitted misidentification reports, each shown with the associated photo and AI result.
- **FR-026**: Admins MUST be able to locate and view the status of any user account and administratively act on accounts as needed.
- **FR-027**: Admins MUST be able to configure per-tier credit allowances, notification templates/timing, and allowed photo file formats, with each setting applying to subsequent user-facing behavior without a code deployment.

**Cross-cutting**

- **FR-028**: System MUST track user activity for monitoring, at minimum: scan attempts, scan success/failure, confidence scores, registration conversions, subscription tier changes/upgrades, credit consumption, chat usage, and notification delivery/engagement.
- **FR-029**: System MUST present a Persian-language user interface for v1, without precluding the later addition of other languages.
- **FR-030**: System MUST require an active internet connection for AI and account actions and MUST fail gracefully (clear error + retry prompt) when the connection or a dependent service is unavailable.

## Key Entities _(include if feature involves data)_

- **User Account**: A registered person. Attributes include authentication identity (email/password), subscription tier, current monthly credit balance, notification preferences, and account status (active, pending-deletion). Owns plants, chats, and reminders.
- **Guest Session**: An anonymous, pre-registration usage context that accumulates scans (up to 2) and is transferable to a User Account upon registration.
- **Plant**: A saved plant belonging to a User Account. Attributes include identified species, care guide reference, and an ordered photo history.
- **Photo / Scan**: An uploaded image and its identification outcome (species, confidence score, care guide, timestamp). Belongs to a Plant (and, before saving, to a Guest Session or the user's scan history).
- **Species / Care Guide Entry**: An admin-maintained record of a plant species and its structured care guidance, referenced by identification results.
- **Comparison Result**: The outcome of comparing recent photos of a Plant, expressing a health trend (improved / worse / unchanged) and the photos referenced.
- **Chat Conversation & Message**: A per-plant AI conversation and its messages; each message consumes credit and may include up to 2 plant photos as context.
- **Subscription Tier / Plan**: An admin-configured plan (Free, Pro, Max) with a monthly credit allowance and pricing, fetched live for the upgrade modal.
- **Credit Transaction**: A debit or refund against a User Account's monthly balance, tied to an AI action or a service-failure refund.
- **Payment / Checkout (Mock)**: A simulated Zarinpal transaction that changes a User Account's subscription tier without moving real money.
- **Misidentification Report**: A user-submitted report referencing a photo and its AI result, reviewed by admins.
- **Notification / Reminder**: A scheduled care reminder for a Plant, delivered by email and/or push per user preference and admin-configured template/timing.
- **Admin**: An internal operator account with full configuration and moderation access.

## Success Criteria _(mandatory)_

<!--
  NOTE: The founder did not set precise numeric targets (PRD §3, §13). The values
  below are reasonable default targets to make the criteria verifiable; they should
  be recalibrated once early usage data is available. See Assumptions.
-->

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from opening the app to receiving a plant identification result (or a low-confidence prompt) for a clear leaf photo in under 60 seconds, without creating an account.
- **SC-002**: For clear, well-lit photos of species present in the plant database, at least 80% of scans return a confident result (≥ 70% confidence) rather than a low-confidence prompt. _(Baseline to confirm with early data.)_
- **SC-003**: No identification result below 70% confidence is ever shown to a user as a species answer (100% enforcement of the confidence gate).
- **SC-004**: At least 100% of a guest's session scans are preserved and visible in the account immediately after they register (zero scan loss on conversion).
- **SC-005**: When an AI-powered action fails, the user's credit balance after the failure equals the balance before the attempt in 100% of cases (no net credit loss on failure).
- **SC-006**: The upgrade modal's listed plans match the admin-configured plans 100% of the time, with no hardcoded plan data.
- **SC-007**: Admin configuration changes (allowed file types, per-tier credit allowances, notification templates/timing, care-guide edits) take effect for users without a code deployment.
- **SC-008**: For a saved plant reaching its predicted reminder date with notifications enabled, a reminder is delivered on that date; with notifications disabled, none is sent.
- **SC-009**: An account-deletion request removes 100% of the account's associated data after the 7-day grace period, and is cancellable at any point within that window.
- **SC-010** _(business, to calibrate)_: Track and grow successful scans and active users over the first 3 months, and user retention over the first year, as the founder's primary success signals; specific numeric targets to be set once early usage data exists.

## Assumptions

1. **Platform**: Web only, fully responsive/mobile-friendly; no native mobile app and no offline mode in v1 (PRD §9).
2. **Localization**: Persian-only UI for v1; architecture should not preclude adding languages later (PRD §9, out-of-scope §6).
3. **Success targets**: Precise numeric targets were not provided; 3-month success = successful scans + active users, 1-year success = retention. Default target values in Success Criteria are placeholders to be recalibrated (PRD §3, §13).
4. **Admin model**: A single admin role with full permissions; no granular admin tiers in v1 (PRD §5).
5. **Priority mapping**: Core scan/identify is the top priority (spec P1). PRD "P1" enhancements (comparison, chat, reminders, deletion) are in v1 scope but mapped to lower spec priorities (P3) because the product's core value functions without them.
6. **Credit costs / allowances**: Exact per-action credit costs and starting per-tier allowances are admin-configurable; sensible launch defaults must be set before launch but are not fixed in this spec (PRD §14).
7. **Paid-tier limit behavior**: Pro/Max users who exhaust monthly credits are shown the same available-options/upgrade modal as Free users (PRD §13.4).
8. **Deletion cancellation**: The 7-day deletion grace period is cancellable by the user within the window (PRD §7.5, §13.5).
9. **Guest attribution**: All guest scans transfer to the account on registration; the specific technical identifier (device/browser/cookie/session) for pre-registration attribution is a planning-phase decision (PRD §14).
10. **Low-confidence UX**: The exact wording of the low-confidence prompt and the number of retries before offering an alternative are design details to be finalized in planning (PRD §14).
11. **Social login scope**: No third-party login in v1 — email/password only. Google sign-in (originally P0 in the PRD, §13.7) was deferred during clarification because Google OAuth is unreliable from Iran; the auth layer should remain provider-extensible.
12. **Payments**: v1 uses a mock Zarinpal gateway only; the payment architecture should accommodate adding real processing and additional providers (e.g., Stripe) later without a rebuild (PRD §9, §11).
13. **Scale**: Modest scale assumed (a few thousand monthly active users) since no explicit target was given; avoid premature over-engineering (PRD §9).
14. **Compliance**: No specific regulatory regime (e.g., GDPR/HIPAA/PCI) is treated as an in-app requirement for v1, given no direct PHI and mock (not real) payments (PRD §9, §13.9).
15. **Analytics**: Google Analytics is the analytics platform; detailed event/funnel configuration is completed by the founder separately (PRD §11, §12).

## Dependencies

- **External AI service** for plant identification, photo comparison, and chat (provider/integration is a technical design decision; product-level requirement only).
- **Authentication** supporting email/password (Google sign-in deferred beyond v1).
- **Email delivery and push notification** mechanisms for care reminders (providers TBD in planning).
- **Mock Zarinpal payment** capability for simulated subscription upgrades.
- **Google Analytics** account/setup (completed by the founder).

## Out of Scope (v1)

- Multi-language support beyond Persian.
- Real (non-mock) payment processing and international payments (e.g., Stripe).
- Antivirus/malware scanning of uploaded photos.
- Native mobile applications.
- Offline functionality.
