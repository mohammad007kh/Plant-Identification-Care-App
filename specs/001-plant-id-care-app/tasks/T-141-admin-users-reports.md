# Task: T-141 - Admin: User Management & Misidentification Reports

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US9 (Administer the product via an admin panel)
**Requirement**: FR-026, FR-025

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

- Authored start: 2026-07-24T20:15:12Z by claude:opus-4-8
- Authored end: 2026-07-24T20:15:12Z by claude:opus-4-8
- Implementation start: 2026-07-26T19:55:19Z by claude
- Implementation end: 2026-07-26T19:55:19Z by claude
- verify-depth: deep

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                            | Value                                            |
| ------------------------------ | ------------------------------------------------ |
| `architecture.pattern`         | modular_monolith (extends `admin` module)        |
| `code_patterns.data_access`    | repository                                       |
| `code_patterns.error_handling` | exceptions → RFC7807                             |
| `backend.authorization`        | role-based; `role=admin` (AdminGuard from T-140) |
| `api.pagination`               | cursor                                           |
| `conventions.files`            | kebab-case                                       |

### Domain Rules (from Station 17 — Admin Tooling, Station 13 — Security)

- **Admin-only** via the `AdminGuard` (T-140). Non-admin → 403.
- **User management (FR-026)**: admins can locate any account (search by email/public_id), view its status (active / pending_deletion / purged, tier, credit balance), and administratively act (e.g., adjust tier/credit, suspend). Actions are audited (admin id + reason). Admins MUST NOT see raw passwords (only hashes exist) and sensitive fields are minimized.
- **Misidentification reports (FR-025)**: admins list user-submitted reports, each shown with the associated photo (signed URL) and the AI result that was reported. Reports are read-only records here (created by T-022).
- **Tenancy note**: admin routes are cross-user BY DESIGN, which is exactly why the guard is mandatory — this is the one place cross-user reads are legitimate.

### API Context (from contracts/openapi.yaml)

```yaml
GET   /v1/admin/users                     → search/list users (cursor); status, tier, balance
GET   /v1/admin/users/{id}                → user detail
PATCH /v1/admin/users/{id}                → administrative action (tier/credit/suspend), audited
GET   /v1/admin/misidentification-reports → list reports w/ photo + AI result (cursor)
# All require role=admin.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task gives admins the ability to find and manage any user account and to review user-submitted misidentification reports (with photo + AI result) — the operational oversight surface of US9.

### Gate Criteria (from Station 17 / Station 13)

- [ ] All routes behind `AdminGuard`; non-admin → 403
- [ ] User search returns status/tier/balance; admin actions audited
- [ ] No sensitive secrets exposed (no password material)
- [ ] Reports listed with photo (signed URL) + AI result

---

## 🎯 Objective

Implement admin endpoints (behind RBAC) to search/view/act on user accounts and to review misidentification reports with their photo and AI result.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/admin/users-admin.controller.ts` + `users-admin.service.ts` - search/detail/action (audited)
- `backend/src/admin/reports-admin.controller.ts` + `reports-admin.service.ts` - list reports w/ signed photo URLs
- `backend/src/admin/users-admin.service.spec.ts` - non-admin blocked; action audited; no secret leakage; report list shape

### Files to Update (REQUIRED)

- `backend/src/admin/admin.module.ts` (from T-140) - provide the new controllers/services
- `shared/src/index.ts` - export admin user/report DTOs

### Code/Logic Requirements

- Depends on T-140 (admin module + guard), T-010/T-011 (users/tiers), T-022/T-012 (reports), storage service (signed URLs).
- User-facing sensitive fields minimized; every mutating admin action writes an audit record.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Backend route** → registered via T-147
- [ ] **API endpoint** → consumed by admin UI (T-142)

## ✅ Verification

**Command**: `cd backend && npm test -- admin-users admin-reports`
**Success Criteria**: Tests pass — non-admin → 403; user search returns status/tier/balance; a mutating action writes an audit row; report list includes photo URL + AI result; no password material in responses.

### Integration Verification

```bash
cd backend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
