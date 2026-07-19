# Clarification Log: Plant Identification & Care App

**Purpose**: Append-only record of clarification sessions on `spec.md`. Each session is one stamp block plus a summary of what was resolved.

`spec.md` is the source of truth for the spec itself; this file records the **history** of how it was clarified. Stamping `spec.md` multiple times would corrupt the "one artifact = one authoring lifecycle" invariant (Article IX, Directive 9) — so clarify writes here instead.

<!--
  Created on first run of /atomicspec.clarify.

  STRUCTURAL INVARIANT (so Claude / Codex / Gemini produce identical shape):
  - Each session is exactly ONE `## Session <ISO-8601-UTC>` block at H2.
  - Children: `### Lifecycle Markers`, `### Resolved`, `### Spec.md edits`,
    `### Open questions` at H3.
  - Do NOT nest sessions. Do NOT introduce a `## Sessions` parent heading.
  - Newest session appears at the TOP of the file (reverse chronological).

  PARSER NOTE: `stamp-lifecycle status` matches `^#{2,6}\s+Lifecycle Markers\s*$`
  (any heading depth H2-H6). The H3 used INSIDE session blocks here is
  intentional and parser-compatible — do not normalize to H2.

  TEMPLATE-VS-REAL: The block below is a TEMPLATE SKELETON, not a real session.
  On FIRST clarify run, REPLACE the `[ISO 8601 UTC TIMESTAMP]` placeholder and
  fill the body in place. On SUBSEQUENT runs, APPEND a new `## Session <ts>`
  block ABOVE the previous one (most-recent-first) and leave prior sessions
  untouched.

  Script-managed: do NOT hand-edit the Lifecycle Markers sections; the body
  content under "Resolved", "Spec.md edits", and "Open questions" is filled
  by the AI during clarify.
-->

---

## Session 2026-07-19T15:23:19Z

### Lifecycle Markers

<!--
  Script-managed. Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1}
  during this clarify session. One stamp per session; sessions never re-stamp.
  H3 heading depth is intentional (nested inside the `## Session` H2) and
  parser-compatible — stamp-lifecycle matches `^#{2,6}\s+Lifecycle Markers\s*$`.
-->


- Authored start:        2026-07-19T15:23:19Z by claude:opus-4-8
- Authored end:          2026-07-19T15:27:14Z by claude:opus-4-8
### Resolved

<!--
  Bullet list of ambiguities resolved this session. Format:
  - **FR-XXX / US-XXX / area**: ambiguous "..." → clarified to "..."
-->

Mode: Detailed — subagent-supervised architecture interview (5 specialists + supervisor). Full decision set written to `specs/_defaults/registry.yaml`; see `specs/_defaults/changelog.md`.

- **AI provider (was BLOCKING risk IR-1)**: unspecified → OpenAI via LangChain/LangGraph behind a swappable `PlantAIProvider`; Iran reachability accepted by founder.
- **Auth rails (FR-007, US-2)**: "email/password + Google (P0)" → **email/password only**; Google deferred (unreliable from Iran). PRD deviation logged.
- **Transactional email**: unspecified → Iranian SMTP relay on owned domain behind a `MailPort`; email is primary reminder/verification channel.
- **Credits/billing (US-4, FR-013..017)**: → subscription tier-allowance only in v1 (no standalone top-ups); ledger kept generic.
- **Compliance scope**: → out of GDPR (Iran-only, no EU users) and out of PCI (mock payments, no cardholder data).
- **~86 architectural defaults** (stack, data model, security, infra, i18n/RTL) auto-accepted from the supervisor's reconciliation — recorded with provenance in the registry.

### Spec.md edits

<!--
  Bullet list of which sections of spec.md were amended this session.
  This is a pointer, not a duplicate of the content. Read spec.md for the
  actual text. Do NOT copy spec content here.
-->

- §Clarifications: added Session 2026-07-19 with the 5 product-affecting resolutions.
- §User Story 2 + FR-007 + Key Entities + Assumptions §11 + Dependencies: amended auth to email/password only (Google deferred).

### Open questions (carried forward)

<!--
  Anything that did NOT get resolved this session. If empty, write "None."
  These items become candidate inputs to the next clarify session or to plan.md.
-->

- IR-1: OpenAI reachability/billing from Iran — founder owns; validate before AI feature build.
- IR-2: Confirm the specific Iranian SMTP relay + domain auth (SPF/DKIM/DMARC) before launch.
- IR-3: Real Zarinpal/Enamad merchant onboarding — parallel business task; MVP ships mock.
- Deferred registry fields (testing frameworks, conventions, error tracking/tracing, ci_cd, secrets, coverage target) left null for /atomicspec.plan to resolve.
