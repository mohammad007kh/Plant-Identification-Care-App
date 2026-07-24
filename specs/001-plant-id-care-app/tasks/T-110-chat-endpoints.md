# Task: T-110 - Plant Chat Endpoints

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
| `architecture.pattern` | modular_monolith (NestJS module: `chat`) |
| `architecture.communication` | async (BullMQ chat job + polling) |
| `code_patterns.data_access` | repository (scoped by `user_id`) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `database.tenancy_model` | single_tenant — every query scoped by `user_id` |
| `conventions.files` | kebab-case |
| `database.primary_key_type` | ULID `id`; opaque UUID `public_id` |

### Domain Rules (from Station 10 — Metering, Station 07 — Data)

- **Chat is a metered AI action.** Each chat message debits credit via `AiGatewayService.runMeteredAction` (T-015, `action=chat`) and refunds on AI failure (FR-017).
- **Free-tier cap (FR-013)**: Free-tier plant chat allows exactly 10 free messages per conversation before the credit paywall applies; every message consumes credit from the monthly balance. The free-message allowance is checked before debit; message #11 (Free tier) triggers the 402/upgrade-modal path (payload from T-082).
- **Context (FR-012)**: up to 2 of the plant's photos may be included as context; the chat is scoped to ONE saved plant.
- **Persistence**: `chat_conversation` (per user+plant) and `chat_message` (`role=user|assistant`, `context_photo_ids[] ≤ 2`, assistant messages carry `usage_record_id`).
- **Tenancy**: conversation/plant MUST belong to the requesting `user_id`; another user's plant/conversation → 404.

### API Context (from contracts/openapi.yaml)

```yaml
POST /v1/plants/{id}/chat          → 202 accepted (enqueues chat job); 402 Problem when out of credit
GET  /v1/plants/{id}/chat/messages → CursorPage<ChatMessage> (history, cursor paginated)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. US6 lets a registered user chat with the AI about one specific saved plant (up to 2 photos of context), with Free-tier limited to 10 free messages before the credit paywall — every message metered through the unified credit system.

### Gate Criteria (from Station 10 — Metering & Limits)

- [ ] Every message metered via `runMeteredAction` (refund on failure)
- [ ] Free-tier 10-message cap enforced before debit; 11th → 402 path
- [ ] ≤ 2 context photos enforced
- [ ] Conversation scoped to one plant and one user (cross-user → 404)
- [ ] Messages persisted with role + usage linkage

---

## 🎯 Objective

Implement plant-scoped AI chat: a metered send endpoint (with Free-tier 10-message cap), an async chat worker, and paginated message history.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/chat/chat.controller.ts` - `POST /v1/plants/:id/chat`, `GET /v1/plants/:id/chat/messages`
- `backend/src/chat/chat.service.ts` - free-cap check → `runMeteredAction` → `PlantAIProvider.chat`
- `backend/src/chat/chat.worker.ts` - BullMQ processor for chat jobs
- `backend/src/chat/chat.repository.ts` - conversation/message reads/writes (scoped by `user_id`)
- `backend/src/chat/chat.module.ts`
- `backend/src/chat/chat.service.spec.ts` - free-cap boundary (msg 10 ok, 11 → paywall on Free), ≤2 photos, refund on failure, tenancy

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export `ChatMessage` / `ChatConversation` types
- (Module registration + frontend are T-117 / T-111.)

### Code/Logic Requirements

- Depends on T-012 (chat schema), T-015 (metering + provider), T-060 (plant ownership), T-040 (auth).
- Free-tier counter is per conversation; Pro/Max consume credit from message 1 with no separate free cap (all messages metered).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → registered in `app.module.ts` via T-117
- [ ] **API endpoint** → consumed by the chat UI (T-111)

## ✅ Verification

**Command**: `cd backend && npm test -- chat`
**Success Criteria**: Tests pass — Free msg 10 succeeds, msg 11 returns 402; >2 context photos rejected; AI failure refunds; cross-user plant → 404.

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
