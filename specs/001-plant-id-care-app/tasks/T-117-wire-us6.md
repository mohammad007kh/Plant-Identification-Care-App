# Task: T-117 - Wire US6 (Plant Chat)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US6 (Chat with the AI about a specific plant)
**Requirement**: N/A (wiring/integration task for US6)

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
| `architecture.pattern` | modular_monolith (register `ChatModule`) |
| `architecture.communication` | async (chat BullMQ worker must be registered) |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 12 — CI/CD & Wiring)

- **UPDATE-only wiring task.** Register `ChatModule` and its BullMQ worker in the app; connect the chat UI + the 402→upgrade-modal path.
- **Confirm the worker is attached at boot** — otherwise chat jobs queue but never process.

### API Context (from contracts/openapi.yaml)

```yaml
# No new endpoints — wires T-110 endpoints/worker + T-111 UI into the app.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task connects US6 chat end-to-end so a user can message the AI about a plant and see replies, with the paywall enforced.

### Gate Criteria (from Station 12)

- [ ] `ChatModule` imported in `app.module.ts`
- [ ] Chat BullMQ worker registered at boot
- [ ] Chat UI reachable from plant detail; 402 opens upgrade modal

---

## 🎯 Objective

Register the chat module + worker in the backend and confirm the US6 chat UI is wired into the plant detail experience with paywall behavior.

## 🛠️ Implementation Details

### Files to Create

- (none — wiring task)

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `ChatModule`; ensure chat queue registered
- `backend/src/chat/chat.module.ts` - register `ChatWorker` as a processor
- `frontend/src/features/plants/plant-detail.tsx` - confirm chat entry point mounts the panel
- `frontend/src/lib/api/index.ts` - confirm chat client calls wired

### Code/Logic Requirements

- Depends on T-110, T-111, T-083.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → `ChatModule` registered; worker attached
- [ ] **Component** → chat panel rendered by plant detail
- [ ] **API endpoint** → frontend hook connected; 402 → upgrade modal

## ✅ Verification

**Command**: `curl -s -X POST http://localhost:3001/v1/plants/<plant-id>/chat -H "authorization: Bearer <test>" -H "content-type: application/json" -d '{"message":"سلام"}' -o /dev/null -w "%{http_code}\n"`
**Success Criteria**: Returns `202` with credit, or `402` when out of credit (never `404` for an owned plant); chat panel renders replies end-to-end.

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
