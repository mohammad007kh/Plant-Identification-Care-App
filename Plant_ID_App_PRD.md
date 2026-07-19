# Product Requirements Document: Plant Identification & Care App

## 1. Overview

A responsive web application that identifies plants from a photo of their leaf using AI, and provides the user with detailed care instructions. Beyond one-off identification, the app lets registered users track individual plants over time, compare new photos against past ones to monitor plant health, chat with an AI about their plant, and receive care reminders (e.g., watering schedules) via email and push notification.

The product targets both casual users who just got a houseplant and want quick answers, and more serious plant enthusiasts who want ongoing tracking and care guidance.

## 2. Problem Statement

Today, when someone wants to identify a plant and learn how to care for it, they typically search the internet manually, browse multiple sites/forums, and try to match photos themselves — a process that is slow and often inconclusive. There is no dedicated, fast, reliable way to identify a plant from a photo and get actionable care guidance in one place, nor to track how a specific plant is doing over time.

## 3. Goals & Success Metrics

- **3-month success:** Number of successful scans; number of active users.
- **1-year success:** User retention rate.

**Assumption:** Precise numeric targets were not specified; these will need to be defined once early usage data is available.

## 4. Constraints & Resources

- **Team:** Solo founder, building with the assistance of Claude Code.
- **Budget:** Self-funded / no external budget.
- **Timeline:** As soon as possible, but the v1 release must be a complete, usable MVP rather than a rushed partial product.
- **Implication:** Scope must be trimmed aggressively to what a solo builder can realistically ship; several requested features are pushed to P1 (see Section 6) rather than P0.

## 5. User Personas & Roles

| Role | Description |
|---|---|
| **Guest** | Unregistered visitor. Can perform up to 2 plant scans before being required to create an account. |
| **Registered User** | Has an account. Can save scanned plants to a profile, upload follow-up photos of the same plant for comparison, chat with the AI about a plant, set care reminders, manage notification preferences, manage subscription/credits, and request account deletion. |
| **Admin** | Internal team member (initially the founder). Manages the plant database, reviews misidentification reports, manages user accounts, configures notification templates/timing, configures allowed photo file types/limits, and configures monthly credit allowances per subscription tier. |

**Assumption:** Single admin role with full access to all admin capabilities — no granular/tiered admin permissions for v1, since only one person is currently operating the admin panel.

## 6. Scope & Prioritization

### In Scope for v1 (MVP)

| Feature | Priority | Notes |
|---|---|---|
| Photo-based plant identification via AI (species name + care guide) | **P0** | Core value proposition. |
| Confidence-threshold logic (≥70% confidence shown as result; <70% prompts user for a better photo) | **P0** | |
| Guest access with 2 free scans, then registration wall | **P0** | |
| Email/password + Google sign-up/login | **P0** | |
| Guest scans carried over and saved to account upon registration | **P0** | |
| User profile with saved plants and photo history | **P0** | |
| Admin panel: plant database management | **P0** | |
| Admin panel: misidentification report review | **P0** | |
| Admin panel: user account management | **P0** | |
| Subscription tiers (Free, Pro, Max) with a unified monthly AI-usage credit system | **P0** | Every AI-powered action (scan, chat message, comparison) consumes credit. |
| Admin-configurable credit allowances per tier | **P0** | |
| Mock payment gateway (Zarinpal, Iran-only) | **P0** | Real payment processing is out of scope for v1. |
| Upgrade modal when credits run out (plans pulled from database, not hardcoded) | **P0** | |
| Credit refund + retry message on AI service failure | **P0** | |
| Follow-up photo comparison for a previously saved plant (health trend) | **P1** | |
| AI chat about a saved plant | **P1** | Free tier: up to 2 photos in context + 10 messages, then paywall via credit system. |
| Care reminders (system-predicted schedule, e.g. watering) via email + push | **P1** | |
| Admin-configurable notification templates and timing | **P1** | |
| User-configurable notification preferences | **P1** | |
| Account deletion flow (user request → 7-day grace period → full deletion) | **P1** | |
| Admin-configurable allowed photo file types | **P1** | |
| Google Analytics integration | **P1** | |

### Explicitly Out of Scope for v1 (Future Phases)

- Multi-language support (v1 is Persian-only; architecture should not preclude adding languages later)
- International payments via Stripe (v1 is Zarinpal-mock only, Iran-focused)
- Real (non-mock) payment processing
- Antivirus/malware scanning of uploaded photos
- Native mobile apps (v1 is responsive web only)
- Offline functionality

## 7. User Flows

### 7.1 Core Flow: Scan & Identify
1. User opens the web app (no login required).
2. User takes or uploads a photo of a plant leaf.
3. Photo is sent to the AI identification service.
4. **If AI confidence ≥ 70%:** result is shown (species name + care guide).
5. **If AI confidence < 70%:** user is told confidence is low and asked to submit a clearer/better photo.
6. This is available twice for guest users. On the 3rd attempt, a registration wall appears.
7. User registers (email/password or Google). All prior guest scans are saved and linked to the new account.

### 7.2 Plant Tracking & Comparison Flow (Registered Users, P1)
1. User selects a previously saved plant from their profile.
2. User uploads a new photo of that same plant.
3. New photo is saved to that plant's history.
4. AI compares the new photo against prior photo(s) and reports whether the plant's condition appears improved, worse, or unchanged.
5. User can optionally start an AI chat about that plant (e.g., "why are the leaves turning yellow?").

### 7.3 Credit Exhaustion Flow
1. User attempts any AI-powered action (scan, chat, comparison) with insufficient credit.
2. A modal appears showing available paid plans (pulled live from the database) with a purchase button.
3. User may upgrade or cancel the action.

### 7.4 AI Service Failure Flow
1. User's action fails due to an AI service error.
2. Consumed credit is refunded to the user's account.
3. User sees a "please try again" message.

### 7.5 Account Deletion Flow
1. User submits a deletion request from their account settings.
2. Account enters a 7-day grace period (deletion is not immediate).
3. After 7 days, all account data is permanently and completely deleted.

**Assumption:** The grace period allows the user to cancel the deletion request within the 7 days; if no cancellation mechanism is wanted, this should be confirmed.

## 8. Functional Requirements

### 8.1 Plant Identification
- **FR-1:** The system shall accept a single photo upload (image formats only, no video) from the user.
  - *Acceptance criteria:* Uploading a non-image file (e.g., video) is rejected with a clear error message.
- **FR-2:** The system shall send the photo to an AI service and return the plant's identity and a structured care guide.
  - *Acceptance criteria:* A successful identification returns species name and care guide fields in a consistent format.
- **FR-3:** The system shall only present an identification result when AI confidence is ≥70%; otherwise it shall prompt the user to submit a better photo.
  - *Acceptance criteria:* A test photo with <70% confidence never displays a species result, only the "low confidence" prompt.
- **FR-4:** Admins shall be able to configure allowed photo file types/formats.
  - *Acceptance criteria:* Changing the allowed formats in the admin panel is reflected in the upload validation immediately.

### 8.2 Guest & Account Access
- **FR-5:** Guest users shall be allowed exactly 2 scans before being required to register.
  - *Acceptance criteria:* The 3rd scan attempt by an unregistered guest triggers a registration wall instead of a scan.
- **FR-6:** Users shall be able to register/log in via email+password or Google.
  - *Acceptance criteria:* Both methods successfully create/access an account.
- **FR-7:** Upon registration, all prior guest scans (however many) shall be saved and linked to the new account.
  - *Acceptance criteria:* After registering, the user's profile shows all scans performed as a guest in the same session.

### 8.3 Plant Tracking & Comparison (P1)
- **FR-8:** Registered users shall be able to save identified plants to their profile.
  - *Acceptance criteria:* A saved plant appears in the user's plant list after scanning.
- **FR-9:** Registered users shall be able to upload a new photo against an existing saved plant.
  - *Acceptance criteria:* The new photo is added to that plant's photo history, not treated as a new plant.
- **FR-10:** The system shall compare a new photo to prior photo(s) of the same plant and report a health trend (improved/worse/unchanged).
  - *Acceptance criteria:* A comparison result is returned referencing at least the two most recent photos.

### 8.4 AI Chat (P1)
- **FR-11:** Registered users shall be able to chat with the AI about a specific saved plant, with up to 2 photos of context and 10 free messages before a paywall applies.
  - *Acceptance criteria:* The 11th message (or use beyond credit availability) triggers the credit-exhaustion flow.
- **FR-12:** Every chat message shall consume credit from the user's monthly allowance.
  - *Acceptance criteria:* Sending a chat message decreases the user's visible credit balance.

### 8.5 Subscriptions & Credits
- **FR-13:** The system shall support three subscription tiers: Free, Pro, Max, each with an admin-configurable monthly credit allowance.
  - *Acceptance criteria:* Changing a tier's credit allowance in the admin panel changes the allowance applied to new/renewing billing cycles.
- **FR-14:** Every AI-powered action (scan, chat message, comparison) shall consume credit from the user's monthly balance.
  - *Acceptance criteria:* Performing any of these three actions decreases the credit balance by the configured amount.
- **FR-15:** When a user's credit is exhausted, the system shall display a modal listing available paid plans (fetched from the database) with a purchase call-to-action.
  - *Acceptance criteria:* The modal's plan list matches what's currently configured in the admin panel, with no hardcoded plan data.
- **FR-16:** If an AI-powered action fails due to a service error, the consumed credit shall be refunded and the user shown a retry message.
  - *Acceptance criteria:* After a simulated AI service failure, the user's credit balance is unchanged from before the attempt.
- **FR-17:** Payment shall be processed via a mock gateway for v1, using Zarinpal as the (simulated) provider for Iranian users.
  - *Acceptance criteria:* Completing a mock checkout updates the user's subscription tier without a real financial transaction occurring.

### 8.6 Notifications (P1)
- **FR-18:** The system shall send care reminders (e.g., watering schedule) via email and push notification, based on a system-predicted schedule per plant.
  - *Acceptance criteria:* A reminder is generated and delivered on the predicted date for a given saved plant.
- **FR-19:** Admins shall be able to configure notification templates and timing/schedules.
  - *Acceptance criteria:* Editing a template or schedule in the admin panel changes future notifications sent to users.
- **FR-20:** Users shall be able to configure their own notification preferences (on/off).
  - *Acceptance criteria:* Disabling notifications in a user's settings stops future notifications from being sent to that user.

### 8.7 Account & Data Management
- **FR-21:** Users shall be able to request account deletion, which is executed after a 7-day grace period, after which all data is completely removed.
  - *Acceptance criteria:* Requesting deletion does not immediately remove data; after 7 days, no user data remains in the system.

### 8.8 Admin Panel
- **FR-22:** Admins shall be able to view and edit the plant database (species info, care guides).
  - *Acceptance criteria:* An edited care guide entry is reflected in future identification results for that species.
- **FR-23:** Admins shall be able to view user-submitted misidentification reports.
  - *Acceptance criteria:* A submitted report appears in the admin panel with the associated photo and AI result.
- **FR-24:** Admins shall be able to manage user accounts (view, and administratively act on accounts as needed).
  - *Acceptance criteria:* An admin can locate a specific user's account and view its status.
- **FR-25:** Admins shall be able to configure subscription tier credit allowances, notification templates/timing, and allowed photo file formats.
  - *Acceptance criteria:* Each of these settings, once changed, applies to subsequent user-facing behavior without a code deployment.

## 9. Non-Functional Requirements

- **Platform:** Web only, fully responsive and mobile-friendly (no native mobile app for v1).
- **Connectivity:** Requires an active internet connection at all times; no offline mode.
- **Scale:** Not precisely defined by the founder.
  - **Assumption:** Architecture should comfortably support a few thousand monthly active users for v1, without requiring premature over-engineering for massive scale.
- **Localization:** Persian-only for v1. Multi-language support is deferred, but the system architecture should not make adding languages later prohibitively difficult.
- **Payments architecture:** Although only a mock Zarinpal gateway is used in v1, the payment architecture should be structured so that adding real processing and additional providers (e.g., Stripe for international users) later does not require a full rebuild.
- **Compliance:** No specific regulatory regime (e.g., GDPR/HIPAA) was identified as a requirement; this app does not appear to process health/medical PHI or payment card data directly (mock gateway).

## 10. Data & Privacy

- **Data stored:** User accounts, plant scan photos and results, plant histories/comparisons, chat messages, subscription/credit status, notification preferences.
- **Sensitivity:** Account credentials are sensitive; photos and chat content are user-generated but not classified as regulated PII/health data in this context.
- **Deletion:** User-initiated account deletion requests are honored after a 7-day grace period, after which all associated data is fully and permanently removed.
- **File types:** Only image uploads are accepted (no video); allowed formats are configurable by admins.
- **Future consideration (P2):** Antivirus/malware scanning of uploaded images prior to storage/processing.

## 11. Integrations

- **Authentication:** Email/password, Google sign-in.
- **Payments:** Mock gateway for v1; Zarinpal (Iran) as the simulated provider. Stripe (international) planned for a future phase.
- **AI Service:** External AI service for plant identification, photo comparison, and chat (queried via photo/text, product-level requirement only — provider and technical integration are a technical design decision).
- **Analytics:** Google Analytics (setup to be completed by the founder separately).
- **Notifications:** Email delivery and push notification delivery mechanisms (provider TBD in technical design).

## 12. Analytics

- All user activity should be tracked for monitoring purposes (exact event taxonomy to be defined, but should include at minimum: scan attempts, scan success/failure, confidence scores, registration conversions, subscription tier changes/upgrades, credit consumption, chat usage, notification delivery/engagement).
- Google Analytics will be used as the analytics platform; specific event/funnel configuration is deferred to the founder's own setup.

## 13. Assumptions Made

1. Exact numeric success targets (e.g., specific user counts) were not defined; 3-month success = successful scans + active users, 1-year success = retention rate.
2. Single admin role with full permissions — no granular admin permission tiers for v1.
3. Core scanning/identification is P0; plant comparison, AI chat, and care reminders are P1 (included in v1 scope, but not required for the product's core value to function).
4. When a user's credit is exhausted and they are on the Free tier, an upgrade modal is shown with live plan data; behavior for Pro/Max users hitting their limit is assumed to be the same (shown available upgrade options) unless specified otherwise.
5. Account deletion grace period (7 days) is assumed to be cancellable by the user during that window (not explicitly confirmed).
6. Soft launch approach undecided — local testing first, soft launch decision to be made afterward.
7. No additional social logins (Apple, Facebook) beyond Google for v1.
8. Scale expectations are modest (assumed a few thousand MAU) since no explicit target was given.
9. No specific regulatory/compliance regime applies, based on the nature of data collected (no explicit PHI/PCI handling in-app due to mock payments).

## 14. Open Questions & Risks

- The exact credit costs per action (scan vs. chat message vs. comparison) are not yet defined — these are admin-configurable, but starting default values need to be set before launch.
- Whether guest scan history is tied to a device/browser session or some other identifier (e.g., cookie) before registration needs a concrete technical decision, though it's a product-level expectation that all guest scans transfer to the account.
- The exact wording/UX of the "low confidence" prompt and how many retries are allowed before another action (e.g., manual entry) is not defined.
- Whether users can cancel an in-progress account deletion request during the 7-day grace period is unconfirmed.
- Antivirus scanning, Stripe integration, and multi-language support are deferred, but no timeline has been set for these future phases.
- Real payment processing (beyond the mock gateway) will need full compliance review (PCI, Zarinpal/Stripe merchant requirements) before it goes live — not addressed in this PRD since v1 uses a mock gateway only.

## 15. Out of Scope / Future Phases

- Multi-language support (full app translation)
- Stripe integration for international payments
- Real (non-mock) payment processing
- Antivirus/malware scanning of uploaded photos
- Native mobile applications
- Offline mode
