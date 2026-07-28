# Task: T-147 - Wire US9 (Admin Panel)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US9 (Administer the product via an admin panel)
**Requirement**: N/A (wiring/integration task for US9)

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
- Implementation start: 2026-07-28T14:14:05Z by claude
- Implementation end: 2026-07-28T14:14:05Z by claude
- verify-depth: deep

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                     | Value                                     |
| ----------------------- | ----------------------------------------- |
| `architecture.pattern`  | modular_monolith (register `AdminModule`) |
| `backend.authorization` | AdminGuard applied to all admin routes    |
| `conventions.files`     | kebab-case                                |

### Domain Rules (from Station 12 — CI/CD & Wiring, Station 08 — Auth/RBAC)

- **UPDATE-only wiring task.** Register `AdminModule` (catalog + config + users + reports controllers) in the app; add the `/admin` route group + admin-only nav entry on the frontend.
- **Verify the guard is applied globally to the admin module** — a single unguarded admin route is a critical security hole. Confirm a non-admin token gets 403 on every admin path.

### API Context (from contracts/openapi.yaml)

```yaml
# No new endpoints — wires T-140 + T-141 controllers and T-142 UI into the app.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task connects the US9 admin panel end-to-end and confirms admin-only access control across the board.

### Gate Criteria (from Station 12 / Station 08)

- [ ] `AdminModule` imported in `app.module.ts`; AdminGuard covers all admin routes
- [ ] `/admin/*` route group registered; nav entry admin-only
- [ ] Non-admin token → 403 on every admin endpoint (spot-checked)

---

## 🎯 Objective

Register the admin module (all controllers + guard) in the backend and wire the `/admin` route group + admin-only navigation in the frontend.

## 🛠️ Implementation Details

### Files to Create

- (none — wiring task)

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `AdminModule`
- `backend/src/admin/admin.module.ts` - confirm all controllers provided + `AdminGuard` applied
- `frontend/src/app/(fa)/admin/layout.tsx` - confirm route group registered
- `frontend/src/components/nav/*` - add admin-only nav entry

### Code/Logic Requirements

- Depends on T-140, T-141, T-142.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Backend route** → `AdminModule` registered; guard on all routes
- [ ] **Frontend page** → `/admin/*` in the app router
- [ ] **Navigation** → admin-only entry
- [ ] **API endpoint** → admin UI hooks connected

## ✅ Verification

**Command**: `curl -s http://localhost:3001/v1/admin/species -H "authorization: Bearer <non-admin-token>" -o /dev/null -w "%{http_code}\n"`
**Success Criteria**: Returns `403` for a non-admin token and `200` for an admin token; `/admin` renders for admins and redirects non-admins.

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
