# Task: T-111 - Frontend Plant Chat

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US6 (Chat with the AI about a specific plant)
**Requirement**: FR-012, FR-013

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
| `frontend.framework` | Next.js App Router (React 18) |
| `frontend.ui_library` | MUI + Emotion (RTL) |
| `frontend.data_fetching` | TanStack Query |
| `frontend.state_management` | Zustand (chat draft/local state) |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | WCAG-AA |

### Domain Rules (from Station 05 — User Flows)

- **RTL chat layout**: message bubbles and alignment mirrored for Persian; input at the bottom; Persian labels via i18n.
- **Context photos**: allow attaching up to 2 of the plant's photos as context (enforce the max in the UI too).
- **Paywall (FR-013)**: when the send returns 402 (Free-tier cap reached / out of credit), open the upgrade modal (from T-083) instead of showing a message.
- **Optimistic + poll**: append the user's message optimistically; poll/stream the assistant reply; on failure show retry (FR-030) and confirm credit unaffected.

### API Context (from contracts/openapi.yaml)

```yaml
POST /v1/plants/{id}/chat          → 202 (or 402 → upgrade modal)   (T-110)
GET  /v1/plants/{id}/chat/messages → CursorPage<ChatMessage>        (T-110)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task builds the US6 chat UI scoped to a saved plant, with up to 2 context photos and the Free-tier paywall behavior.

### Gate Criteria (from Station 05 — User Flows)

- [ ] RTL chat UI, Persian labels via i18n
- [ ] ≤ 2 context photos enforced in UI
- [ ] 402 opens the upgrade modal (not an error toast)
- [ ] History paginates; failure shows retry

---

## 🎯 Objective

Build the plant-scoped chat interface with context-photo attachment, message history, and paywall-on-402 behavior.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/chat/chat-panel.tsx` - conversation view + composer
- `frontend/src/features/chat/use-chat.ts` - TanStack Query hook (send + history + poll)
- `frontend/src/features/chat/chat-panel.test.tsx` - renders history, enforces ≤2 photos, opens upgrade modal on 402

### Files to Update (REQUIRED)

- `frontend/src/features/plants/plant-detail.tsx` - add a "Chat" entry point/tab that mounts the chat panel
- `frontend/src/lib/api/index.ts` - add chat send + history client calls

### Code/Logic Requirements

- Depends on T-110 (endpoints), T-061 (plant detail), T-083 (upgrade modal for the 402 path).
- Uses shared `ChatMessage` types.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Component** → chat panel rendered by plant detail
- [ ] **API endpoint** → hook connected to chat send + history
- [ ] **Navigation** → chat entry point present on the plant detail view

## ✅ Verification

**Command**: `cd frontend && npm test -- chat`
**Success Criteria**: Tests pass — history renders; 3rd photo attach blocked; a 402 send opens the upgrade modal.

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
