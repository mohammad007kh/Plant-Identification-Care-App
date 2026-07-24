# Task: T-161 - Connectivity & Service-Failure Graceful Degradation

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Cross-cutting (spans all AI/account flows)
**Requirement**: FR-030

## Lifecycle Markers

<!--
  Script-managed. Do NOT hand-edit. (v0.3+)
  Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1}.
  Task files carry BOTH lifecycles: authoring (during /atomicspec.tasks)
  and implementation (during /atomicspec.implement). See Article IX,
  Directive 9 for the Orientation Read Surface that consumes these.
  Optional verify-depth field (light|deep) is set by the authoring AI
  (during /atomicspec.tasks) and obeyed — not re-decided — by the
  resuming AI in Phase 0.
  Empty section = legacy / pre-v0.3 artifact, treated as `legacy_closed`.
-->

---


- Authored start:        2026-07-24T20:15:12Z by claude:opus-4-8
- Authored end:          2026-07-24T20:15:12Z by claude:opus-4-8
- Implementation start:  <empty>
- Implementation end:    <empty>
- verify-depth:          light
## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith (cross-cutting: frontend error boundaries + backend filters) |
| `code_patterns.error_handling` | exceptions → RFC7807; typed error codes |
| `frontend.data_fetching` | TanStack Query (retry/error states) |
| `error_handling.logging` | structured JSON logs |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 15 — Performance/Resilience, Station 11 — Observability)

- **Online-only, fail gracefully (FR-030)**: AI and account actions require connectivity; when the connection or a dependent service (OpenAI, DB, Redis, SMTP, payment) is unavailable, show a clear Persian error + retry prompt — never a blank screen, silent hang, or cryptic stack trace.
- **Credit safety on failure**: a failed AI action must leave credit unchanged (this ties to T-015 refund) and the UI must communicate that no credit was lost.
- **Standardized error surface**: backend maps upstream/timeouts to a stable RFC7807 `problem+json` with a typed `code` (e.g., `ai_unavailable`, `upstream_timeout`, `offline`); the frontend maps codes → localized messages + a retry affordance.
- **Timeouts + retry/backoff** on outbound calls (AI, SMTP, payment verify) so a hung dependency surfaces as a clean error rather than an indefinite spinner.
- **Offline detection (frontend)**: detect `navigator.onLine`/failed fetches and present an offline banner with retry.

### API Context (from contracts/openapi.yaml)

```yaml
# Applies to all endpoints via the global RFC7807 exception filter (T-002).
# Adds typed error codes for upstream/connectivity failures.
Problem: { type, title, status, detail, code, requestId }
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This cross-cutting task makes the product fail gracefully when connectivity or a dependency (AI, DB, mail, payment) is down — clear Persian error + retry, credit preserved — instead of hanging or crashing.

### Gate Criteria (from Station 15 / Station 11)

- [ ] Outbound calls (AI/SMTP/payment) have timeouts + retry/backoff
- [ ] Upstream/timeout failures map to stable RFC7807 codes
- [ ] Frontend maps error codes → localized Persian messages + retry
- [ ] Offline state detected and surfaced
- [ ] Failed AI action shows "no credit lost" (aligns with T-015 refund)

---

## 🎯 Objective

Harden connectivity/service-failure handling end-to-end: backend timeouts + typed RFC7807 error codes, and frontend error boundaries + offline detection with localized retry.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/common/errors/error-codes.ts` - typed error-code enum (ai_unavailable, upstream_timeout, offline, etc.)
- `backend/src/common/http/outbound.ts` - shared timeout + retry/backoff wrapper for outbound calls
- `frontend/src/components/errors/error-boundary.tsx` - app-level error boundary
- `frontend/src/components/errors/offline-banner.tsx` - connectivity banner
- `frontend/src/lib/api/error-map.ts` - error-code → Persian message + retry mapping
- `backend/src/common/errors/error-mapping.spec.ts` - upstream failures map to correct codes

### Files to Update (REQUIRED)

- `backend/src/common/filters/problem.filter.ts` (T-002) - include `code` and map upstream/timeout exceptions
- `backend/src/ai-gateway/ai-gateway.service.ts` - use the outbound wrapper (timeout/backoff)
- `frontend/src/app/(fa)/layout.tsx` - mount error boundary + offline banner
- `frontend/src/lib/api/index.ts` - central fetch applies the error map + retry affordance

### Code/Logic Requirements

- Depends on T-002 (filter), T-015 (AI gateway/refund), T-003 (frontend shell).
- Retry must be safe: outbound retries only on idempotent/read paths or where an idempotency key protects credit.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Component** → error boundary + offline banner mounted in the app shell
- [ ] **API endpoint** → central client applies error mapping + retry
- [ ] **Backend route** → global filter emits typed codes

## ✅ Verification

**Command**: `cd backend && npm test -- error-mapping && cd ../frontend && npm test -- error-boundary offline`
**Success Criteria**: Tests pass — a simulated AI/DB outage returns a typed RFC7807 code; the frontend renders a localized Persian error + retry and an offline banner when disconnected; failed AI action reports no credit lost.

### Integration Verification

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
