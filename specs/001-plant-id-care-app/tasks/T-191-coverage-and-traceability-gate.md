# Task: T-191 - Coverage & Traceability Verification Gate

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Final Verification (spans US1–US9)
**Requirement**: FR-028, FR-029, FR-030 (and full-suite regression across all FRs)

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
| `testing.unit_framework` | Vitest |
| `testing.integration_framework` | Supertest |
| `testing.e2e_framework` | Playwright |
| `testing.coverage_target` | 80 |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 12 — CI/CD)

- **Coverage gate**: the full suite (unit + integration) MUST meet the 80% coverage target; the build fails below it.
- **Traceability closure**: every FR-001…FR-030 must map to at least one implemented + verified task in `traceability.md` (100% coverage, no orphan tasks, no uncovered requirements).
- **Full regression**: run the entire test suite + typecheck + lint across `backend/`, `frontend/`, `shared/` and confirm green.
- **Accessibility spot-check (FR-029/WCAG-AA)**: run an automated a11y check (e.g., axe) on the key pages; note that full WCAG validation needs manual assistive-tech testing (out of automated scope).

### API Context (from contracts/openapi.yaml)

```yaml
# Meta-task: verifies the whole system, no new endpoints.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This final task is the release gate: it confirms the whole test suite passes at the 80% coverage bar, every functional requirement is traceably covered, and the codebase typechecks and lints clean across all three packages.

### Gate Criteria (from Station 12)

- [ ] Unit + integration coverage ≥ 80% (build fails otherwise)
- [ ] `traceability.md` shows 100% FR coverage, no orphans
- [ ] `backend/`, `frontend/`, `shared/` typecheck + lint clean
- [ ] Playwright critical-flow suite (T-190) green
- [ ] Automated a11y check run on key pages (manual WCAG noted as out-of-scope)

---

## 🎯 Objective

Run the full verification gate — coverage ≥ 80%, 100% requirement traceability, clean typecheck/lint across all packages, green E2E — and confirm release readiness.

## 🛠️ Implementation Details

### Files to Create

- `scripts/verify-traceability.mjs` - asserts every FR-XXX in spec.md maps to a verified task in traceability.md (exits non-zero on gaps)

### Files to Update (REQUIRED)

- `specs/001-plant-id-care-app/traceability.md` - finalize all statuses to ✅ when verified
- `package.json` - add a `verify:all` script chaining typecheck + lint + test:cov + verify-traceability + test:e2e

### Code/Logic Requirements

- Depends on ALL prior tasks (this is the terminal gate). Run after every user story + cross-cutting task is complete.
- The traceability script parses FR ids from `spec.md` and cross-references `traceability.md`.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **New service** → `verify:all` script added to package.json and runnable in CI later

## ✅ Verification

**Command**: `npm run verify:all`
**Success Criteria**: Typecheck + lint clean across backend/frontend/shared; unit+integration coverage ≥ 80%; traceability script reports 100% FR coverage with no gaps; Playwright critical flows pass.

### Integration Verification

```bash
node scripts/verify-traceability.mjs && npm run test:cov
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
