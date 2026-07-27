# Task: T-121 - Frontend Notification Preferences

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US7 (Receive and control care reminders)
**Requirement**: FR-022

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
- Implementation start: 2026-07-27T12:42:13Z by claude
- Implementation end: 2026-07-27T12:42:13Z by claude
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                      | Value                         |
| ------------------------ | ----------------------------- |
| `frontend.framework`     | Next.js App Router (React 18) |
| `frontend.ui_library`    | MUI + Emotion (RTL)           |
| `frontend.data_fetching` | TanStack Query                |
| `frontend.form_library`  | React Hook Form + Zod         |
| `conventions.files`      | kebab-case                    |
| `ui_specs.accessibility` | WCAG-AA                       |

### Domain Rules (from Station 05 — User Flows)

- **Settings page (RTL, Persian)**: toggles for email reminders and push reminders, bound to `PATCH /v1/account/notifications`.
- **Push opt-in flow**: requesting browser push permission and registering the subscription via `POST /v1/account/push-subscription` is best-effort; if the browser/environment blocks it, degrade gracefully and keep email working (FR-020/FR-030).
- **Immediate effect (FR-022)**: toggling off reflects immediately and stops future notifications.

### API Context (from contracts/openapi.yaml)

```yaml
PATCH /v1/account/notifications      → update notif_email_enabled/notif_push_enabled  (T-120)
POST  /v1/account/push-subscription  → register web-push subscription (best-effort)   (T-120)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task builds the US7 settings UI where a user turns their care reminders on/off per channel.

### Gate Criteria (from Station 05 — User Flows)

- [ ] RTL settings UI, Persian labels via i18n
- [ ] Toggles bound to the prefs endpoint; optimistic + confirmed
- [ ] Push permission flow degrades gracefully when unavailable

---

## 🎯 Objective

Build the account settings UI for enabling/disabling email and push care reminders, including best-effort push subscription registration.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/settings/notification-settings.tsx` - channel toggles
- `frontend/src/features/settings/use-notification-prefs.ts` - TanStack Query hook (read + mutate)
- `frontend/src/features/settings/push-subscribe.ts` - browser push permission + subscription registration (best-effort)
- `frontend/src/features/settings/notification-settings.test.tsx` - toggle persists; push-unavailable degrades to email-only

### Files to Update (REQUIRED)

- `frontend/src/lib/api/index.ts` - add notification prefs + push-subscription client calls
- (Route + nav added in T-127.)

### Code/Logic Requirements

- Depends on T-120 (endpoints), T-043 (authenticated shell/session).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **API endpoint** → hook connected to prefs + push-subscription endpoints
- [ ] **Component** → mounted on the settings page (route added in T-127)

## ✅ Verification

**Command**: `cd frontend && npm test -- notification-settings`
**Success Criteria**: Tests pass — toggling a channel calls the PATCH endpoint and reflects state; when push is unavailable, email toggle still works.

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
