# Task: T-107 - Wire US5 (Health Comparison)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US5 (Track a plant's health with follow-up photo comparison)
**Requirement**: N/A (wiring/integration task for US5)

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

| Key                          | Value                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `architecture.pattern`       | modular_monolith (register providers, no new module needed) |
| `architecture.communication` | async (BullMQ worker must be registered to consume jobs)    |
| `conventions.files`          | kebab-case                                                  |

### Domain Rules (from Station 12 — CI/CD & Wiring)

- **Wiring task = UPDATE only, no new feature files.** Register the comparison worker/service so enqueued comparison jobs are actually processed, and ensure the frontend comparison panel is reachable from the plant detail route.
- **A worker that isn't registered silently drops jobs** — the most common "it built but does nothing" failure. Verify the queue processor is attached at boot.

### API Context (from contracts/openapi.yaml)

```yaml
# No new endpoints — wires the T-100 worker + T-101 UI into the running app.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task connects US5's comparison worker and UI so a follow-up photo produces a health-trend verdict end-to-end.

### Gate Criteria (from Station 12)

- [ ] Comparison BullMQ worker registered at app boot
- [ ] Comparison panel reachable from plant detail
- [ ] End-to-end: upload follow-up photo → poll → verdict returned

---

## 🎯 Objective

Register the comparison worker/service in the backend and ensure the US5 UI is wired into the plant detail experience.

## 🛠️ Implementation Details

### Files to Create

- (none — wiring task)

### Files to Update (REQUIRED)

- `backend/src/plants/plants.module.ts` - provide `ComparisonService`, `ComparisonRepository`, and register `ComparisonWorker` as a BullMQ processor
- `backend/src/app.module.ts` - ensure `PlantsModule` (with comparison) and the BullMQ queue are imported
- `frontend/src/features/plants/plant-detail.tsx` - confirm the comparison panel is mounted (from T-101)

### Code/Logic Requirements

- Depends on T-100, T-101, T-060, T-061.
- After wiring, the comparison job created by `POST /v1/plants/:id/photos` MUST be picked up by the registered worker.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Backend route** → comparison worker registered in `PlantsModule`
- [ ] **Component** → comparison panel rendered by plant detail
- [ ] **API endpoint** → frontend hook connected to follow-up + poll endpoints

## ✅ Verification

**Command**: `cd backend && npm run test:e2e -- --grep "comparison"` (Playwright/integration: upload two photos → verdict)
**Success Criteria**: A follow-up photo on a plant with an existing photo yields a `completed` comparison scan with a verdict; the plant detail page displays it.

### Integration Verification

```bash
curl -s http://localhost:3001/v1/scans/<comparison-scan-id> -H "authorization: Bearer <test>" | jq '.result.verdict | test("improved|worse|unchanged")'
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
