# Task: T-140 - Admin: Plant Catalog & Operational Config

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US9 (Administer the product via an admin panel)
**Requirement**: FR-024, FR-027, FR-005, FR-021

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
- verify-depth:          deep
## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith (NestJS module: `admin`) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `backend.authorization` | role-based; `role=admin` required (guard) |
| `conventions.files` | kebab-case |
| `database.primary_key_type` | ULID `id`; opaque UUID `public_id` |

### Domain Rules (from Station 17 — Admin Tooling, Station 08 — Auth/RBAC)

- **Admin-only (RBAC)**: every admin endpoint MUST be protected by an `AdminGuard` requiring `role=admin`; a normal user calling an admin route gets 403. This is the single most security-sensitive surface — no admin route may be reachable without the guard.
- **Catalog editing (FR-024)**: admins view/edit `species` (scientific/common name, care-guide jsonb); edits reflect in FUTURE identification results for that species (identify reads live species/care-guide data — no cached copy that goes stale).
- **Operational config (FR-027, FR-005, FR-021)**: admins edit `app_config`-backed settings — allowed photo file formats (FR-005), notification templates + timing (FR-021), and per-tier credit allowances (FR-014/FR-019, tier rows). Every change applies to subsequent behavior WITHOUT a code deploy (config is read live at request/send time by the consuming services).
- **Audit**: config/catalog edits record `created_by`/`updated_by` (admin id) for traceability.

### API Context (from contracts/openapi.yaml)

```yaml
GET/POST/PATCH /v1/admin/species                → catalog CRUD (care guides)
GET/PATCH      /v1/admin/config                  → allowed file types, templates, timing
GET/PATCH      /v1/admin/tiers                    → per-tier credit allowances
# All require role=admin (AdminGuard).
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. US9 gives the single admin role the tooling to run the product: maintain the plant/species database and care guides, and configure operational settings (allowed file types, notification templates/timing, per-tier credit allowances) that take effect live without deployments.

### Gate Criteria (from Station 17 / Station 08)

- [ ] Every admin route behind `AdminGuard` (role=admin); non-admin → 403
- [ ] Species/care-guide edits reflected in future identifications (live read)
- [ ] Config edits (file types, templates, allowances) apply with no code deploy
- [ ] Edits audited with admin id

---

## 🎯 Objective

Implement admin endpoints (behind an RBAC guard) for the plant/species catalog and the live operational config (file types, notification templates/timing, per-tier allowances).

## 🛠️ Implementation Details

### Files to Create

- `backend/src/admin/admin.guard.ts` - requires `role=admin`
- `backend/src/admin/catalog.controller.ts` + `catalog.service.ts` - species/care-guide CRUD
- `backend/src/admin/config.controller.ts` + `config.service.ts` - `app_config` (file types, templates, timing) + tier allowances
- `backend/src/admin/admin.module.ts`
- `backend/src/admin/admin.guard.spec.ts` + `config.service.spec.ts` - non-admin blocked; config change read live by consumers

### Files to Update (REQUIRED)

- `backend/src/common/uploads/upload-validation.service.ts` (T-014) - confirm it reads allowed types from this config service
- `shared/src/index.ts` - export admin DTO/types
- (Module registration is T-147.)

### Code/Logic Requirements

- Depends on T-010 (species), T-011 (tiers), T-012 (app_config), T-040 (auth/role).
- Config is stored once and read live everywhere (no duplication); changing allowed file types immediately affects T-014 validation.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → admin controllers registered via T-147
- [ ] **API endpoint** → consumed by the admin UI (T-142)

## ✅ Verification

**Command**: `cd backend && npm test -- admin-catalog admin-config admin-guard`
**Success Criteria**: Tests pass — non-admin gets 403; editing a species changes what a subsequent identify returns; changing allowed file types changes upload validation with no restart.

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
