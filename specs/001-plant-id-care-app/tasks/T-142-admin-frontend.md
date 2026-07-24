# Task: T-142 - Admin Panel Frontend

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US9 (Administer the product via an admin panel)
**Requirement**: FR-024, FR-025, FR-026, FR-027

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
| `frontend.framework` | Next.js App Router (React 18) |
| `frontend.ui_library` | MUI + Emotion (RTL) |
| `frontend.data_fetching` | TanStack Query |
| `frontend.form_library` | React Hook Form + Zod |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | WCAG-AA |

### Domain Rules (from Station 17 — Admin Tooling, Station 08 — Auth/RBAC)

- **Admin-gated route group (RTL, Persian)**: an `/admin` route group visible only to `role=admin`; non-admins are redirected. Client gating is UX only — the server `AdminGuard` (T-140/T-141) is the real boundary.
- **Sections**: (1) plant/species catalog editor with care-guide fields (FR-024); (2) config editor — allowed file types, notification templates + timing, per-tier credit allowances (FR-027); (3) user search/detail with administrative actions (FR-026); (4) misidentification reports list with photo + AI result (FR-025).
- **Forms**: RHF + Zod; care-guide jsonb edited via structured fields; destructive/administrative actions confirmed.

### API Context (from contracts/openapi.yaml)

```yaml
/v1/admin/species  /v1/admin/config  /v1/admin/tiers                 (T-140)
/v1/admin/users  /v1/admin/users/{id}  /v1/admin/misidentification-reports  (T-141)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task builds the admin panel UI: catalog editing, live operational config, user management, and misidentification-report review — all behind an admin-only route group.

### Gate Criteria (from Station 17 / Station 08)

- [ ] `/admin` group gated to role=admin (redirect non-admins)
- [ ] Catalog, config, users, reports sections wired to their endpoints
- [ ] Forms validate (RHF+Zod); admin actions confirmed
- [ ] RTL, Persian labels via i18n

---

## 🎯 Objective

Build the admin-only panel UI covering catalog editing, live config, user management, and misidentification-report review.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/app/(fa)/admin/layout.tsx` - admin route group + role gate
- `frontend/src/features/admin/catalog-editor.tsx` - species/care-guide CRUD
- `frontend/src/features/admin/config-editor.tsx` - file types, templates/timing, tier allowances
- `frontend/src/features/admin/users-admin.tsx` - search/detail/actions
- `frontend/src/features/admin/reports-admin.tsx` - report list w/ photo + AI result
- `frontend/src/features/admin/use-admin.ts` - TanStack Query hooks
- `frontend/src/features/admin/admin.test.tsx` - non-admin redirected; each section renders + submits

### Files to Update (REQUIRED)

- `frontend/src/lib/api/index.ts` - add admin client calls
- (Route registration + nav entry handled in T-147.)

### Code/Logic Requirements

- Depends on T-140, T-141 (endpoints), T-043 (auth/session with role).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Frontend page** → `/admin/*` added to app router (T-147)
- [ ] **Navigation** → admin entry shown only to admins
- [ ] **API endpoint** → hooks connected to all admin endpoints
- [ ] **Component** → section components rendered by the admin layout

## ✅ Verification

**Command**: `cd frontend && npm test -- admin`
**Success Criteria**: Tests pass — a non-admin is redirected away from `/admin`; catalog/config/users/reports sections render and submit to their endpoints.

### Integration Verification

```bash
cd frontend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
