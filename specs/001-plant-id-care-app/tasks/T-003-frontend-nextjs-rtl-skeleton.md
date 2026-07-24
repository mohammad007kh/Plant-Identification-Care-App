# Task: T-003 - Frontend Next.js RTL Skeleton

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Foundational (cross-cutting; underlies all end-user-facing stories US1-US9)
**Requirement**: FR-029

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
- Implementation start:  2026-07-24T20:26:53Z by claude:opus-4-8
- Implementation end:    2026-07-24T20:36:29Z by claude:opus-4-8
- verify-depth:          light
## 📋 Embedded Context (READ THIS FIRST)

<!--
  SELF-CONTAINED TASK (Constitution Directive 8):
  This section contains ALL context needed to implement this task.
  Do NOT read plan.md, spec.md, stations, or subagents.

  If this section is empty or insufficient, report as task quality issue.
-->

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith (frontend is a standard Next.js App Router app, not part of the backend monolith) |
| `architecture.layers` | N/A |
| `code_patterns.data_access` | repository (backend concern; not applicable to this frontend-only task) |
| `code_patterns.error_handling` | exceptions (frontend: error boundaries / thrown errors caught by TanStack Query, not implemented in this task) |
| `code_patterns.validation_approach` | schema (Zod, shared package — forms wired in later tasks) |
| `database.tenancy_model` | single_tenant (not applicable to this frontend-only task) |
| `conventions.files` | kebab-case (e.g. `theme-provider.tsx`, `rtl-cache.ts`) |
| `conventions.variables` | camelCase |

### Domain Rules (from subagent/station)

- **Frontend stack** (registry `frontend.*`): Next.js App Router, hybrid rendering, MUI as the UI library, Emotion for styling, Zustand for client state, TanStack Query for server state, React Hook Form + Zod for forms, `next-router` for routing, **`i18n_posture: i18n_from_day_one`**.
- **RTL requirement** (plan.md "Additional UI Requirements" + FR-029): `dir="rtl"` and `lang="fa"` MUST be set at the document root. Only logical CSS properties (`margin-inline-*`, `padding-inline-*`, etc.) are permitted — no physical `left`/`right` properties, to stay RTL-safe.
- **Styling**: MUI + Emotion only — this is the single UI framework decision (no Tailwind, per founder's explicit "minimum frameworks" constraint). RTL support is achieved via `stylis-plugin-rtl` wired into the Emotion cache, combined with an MUI theme configured with `direction: 'rtl'`.
- **Fonts**: self-hosted Vazirmatn (`woff2`) via `@font-face` in `frontend/src/theme/fonts/` — explicitly **no Google Fonts CDN** (Iran-reachability constraint carried throughout this project).
- **i18n architecture**: although v1 ships **Persian (`fa`) only** (FR-029, Assumption #2 in spec.md), the message-catalog and locale-segmented routing structure must be built so that adding a second locale later requires no rebuild — i.e., routes live under a locale segment (e.g. `app/(fa)/...` or `app/[locale]/...` with `fa` as the only configured locale for now) and UI strings are pulled from a message catalog (not inlined), even though only one catalog (`fa.json` or similar) exists today.
- **Icons**: lucide (bundled, not a CDN).
- **Design tokens**: CSS variables sourced from `frontend/src/theme/` (registry `ui_specs.design_token_source`).
- **Accessibility**: WCAG AA is the target (registry `ui_specs.accessibility: wcag-aa`) — not fully implemented in this skeleton task, but the root layout must not introduce accessibility regressions (e.g. `<html lang="fa" dir="rtl">` is itself an accessibility requirement, not just a visual one).

### API Context (from contracts/)

Not applicable — this is a pure frontend shell/theming task with no API calls.

### Feature Summary

A Persian/RTL web app that identifies plants from a leaf photo via an AI provider, tracks plants over time, and meters AI usage on a credit system. All end-user screens are Persian-language and right-to-left; this task builds the Next.js application shell (root RTL layout, MUI/Emotion RTL theme, self-hosted font, and i18n scaffolding) that every user-facing page in later tasks will render inside.

### Gate Criteria (from subagent/station)

- [ ] Root layout sets `<html lang="fa" dir="rtl">`.
- [ ] MUI theme is configured with `direction: 'rtl'` and wired to an Emotion cache using `stylis-plugin-rtl`.
- [ ] Vazirmatn is self-hosted (local `woff2` files + `@font-face`), not loaded from any external font CDN.
- [ ] An i18n scaffold exists (message catalog + locale-segmented routing) that ships only `fa` today but does not hardcode `fa` in a way that blocks adding a second locale later.
- [ ] `npx tsc --noEmit` passes with zero errors under `frontend/`.

---

## 🎯 Objective

Build the Next.js App Router skeleton for the Persian/RTL web frontend: a root layout under a `(fa)` locale segment with `dir="rtl" lang="fa"`, an MUI + Emotion theme with RTL support (`stylis-plugin-rtl`), a self-hosted Vazirmatn font, and an i18n scaffold (message catalogs + locale-segmented routing) that ships `fa` only in v1 but is structurally extensible to additional locales without a rebuild, satisfying FR-029.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `frontend/src/app/(fa)/layout.tsx` - Root layout for the `fa` locale segment: renders `<html lang="fa" dir="rtl">`, wraps `children` in the RTL Emotion `CacheProvider` and MUI `ThemeProvider`, loads the Vazirmatn `@font-face` (via a global stylesheet import or `next/font/local`), and provides the i18n message catalog to the tree (e.g. via a lightweight context/provider reading `frontend/src/i18n/fa.json`).
- `frontend/src/app/(fa)/page.tsx` - A minimal placeholder home page (e.g. renders an MUI `Typography` with a Persian greeting string pulled from the message catalog) — proves the RTL/theme/i18n wiring actually renders end-to-end; later tasks replace its content with the real scan/upload flow.
- `frontend/src/theme/theme.ts` - MUI theme definition: `createTheme({ direction: 'rtl', typography: { fontFamily: 'Vazirmatn, sans-serif' }, ... })`. Minimal palette/spacing tokens are fine for this task — full design tokens are not required yet, only the RTL + font wiring.
- `frontend/src/theme/rtl-cache.ts` - Emotion cache factory: `createCache({ key: 'muirtl', stylisPlugins: [rtlPlugin] })` using `stylis-plugin-rtl`.
- `frontend/src/theme/theme-provider.tsx` - A client component (`'use client'`) wrapping children in `<CacheProvider value={rtlCache}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></CacheProvider>`.
- `frontend/src/theme/fonts/vazirmatn.ts` (or `.css`) - `@font-face` declarations pointing at locally-hosted Vazirmatn `.woff2` files placed under `frontend/src/theme/fonts/` (actual binary font files must be sourced/vendored here — use `next/font/local` if simpler, still self-hosted either way; do not reference any Google Fonts or external CDN URL anywhere in this file).
- `frontend/src/i18n/fa.json` - The Persian message catalog: a flat or nested key→string map (e.g. `{ "home.greeting": "به شناسایی گیاه خوش آمدید" }`) used by the placeholder page.
- `frontend/src/i18n/index.ts` - A minimal i18n accessor (e.g. `getMessages(locale: 'fa') => typeof faMessages`) structured so a second locale file (e.g. `en.json`) could be added later and selected via the locale route segment without changing this function's shape.
- `frontend/next.config.js` - Standard Next.js config (App Router is default in Next 13+; no special i18n router config is required since locale segmentation is handled via the `(fa)` route group / `[locale]` folder convention rather than Next's legacy `i18n` config key, which does not support the App Router).
- `frontend/tsconfig.json` - Strict TypeScript config matching backend conventions (`strict: true`).

### Files to Update (REQUIRED)

- `frontend/package.json` - Add real dependencies (`next`, `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `@emotion/cache`, `stylis`, `stylis-plugin-rtl`, `typescript`, `@types/react`, `@types/node`) and replace the T-001 placeholder scripts with real ones: `"dev": "next dev -p 3000"`, `"build": "next build"`, `"start": "next start"`.
- `package.json` (repo root) - Update the root `dev` script to also launch the frontend (e.g. via `concurrently "npm run start:dev --workspace=backend" "npm run dev --workspace=frontend"`), completing the wiring started in T-002.

### Code/Logic Requirements

- `<html>` tag must literally contain `lang="fa"` and `dir="rtl"` attributes — this is the FR-029 + RTL gate criterion and is checked by any later E2E/Playwright smoke test.
- No physical CSS properties (`margin-left`, `padding-right`, `left`, `right` as layout offsets) may appear in any file created by this task — use logical equivalents (`margin-inline-start`, `inset-inline-end`, etc.) exclusively.
- No Google Fonts (or any external font CDN) reference may appear anywhere in `frontend/src/theme/fonts/`.
- The i18n catalog access function must take a `locale` parameter (even though only `'fa'` is a valid value today) — do not hardcode Persian strings directly inline in components going forward; route them through `frontend/src/i18n/`.
- Do not implement the actual scan/upload UI, navigation, or any business feature in this task — the placeholder page's only job is to prove the shell renders in Persian/RTL with the theme and font applied.

## 🔌 Wiring Checklist

<!--
  Check all that apply. If any are checked, the "Files to Update" section
  MUST contain the corresponding file.

  Use the section matching your platform. Skip sections that don't apply.
-->

### Web (React/Vue/Next.js/etc.)
- [x] **Frontend page** → Added to app router configuration (`frontend/src/app/(fa)/page.tsx` registered under the `(fa)` route group, rendered via `frontend/src/app/(fa)/layout.tsx`)
- [ ] **Backend route** → Registered in main app/router file
- [ ] **Navigation** → Link added to sidebar/nav component (no nav exists yet — single placeholder page only)
- [ ] **API endpoint** → Frontend store/hook calls this endpoint
- [x] **Component** → Rendered by a parent component (`ThemeProvider`/`CacheProvider` in `theme-provider.tsx` rendered by `layout.tsx`, which wraps `page.tsx`)

## ✅ Verification

**Command**: `cd frontend && npx tsc --noEmit`
**Success Criteria**: Exits with code 0 and no type errors printed.

### Integration Verification (if wiring items checked)

```bash
# Start the frontend dev server, then verify RTL/lang attributes and Persian content render:
cd frontend && npm run dev &
sleep 5
curl -s http://localhost:3000/ | grep -q 'dir="rtl"' && curl -s http://localhost:3000/ | grep -q 'lang="fa"' && echo "RTL_LANG_OK"
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
