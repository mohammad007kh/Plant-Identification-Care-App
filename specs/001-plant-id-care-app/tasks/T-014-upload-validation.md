# Task: T-014 - Image Upload Validation

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1 (foundation — shared by all photo-upload flows)
**Requirement**: FR-004

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
- Implementation start: 2026-07-26T11:09:05Z by claude:opus-4-8
- Implementation end: 2026-07-26T11:11:55Z by claude:opus-4-8
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                                 | Value                                                           |
| ----------------------------------- | --------------------------------------------------------------- |
| `architecture.pattern`              | modular_monolith (NestJS common module: `uploads`)              |
| `architecture.layers`               | pipe/guard → service                                            |
| `code_patterns.error_handling`      | exceptions → global filter → RFC7807 `application/problem+json` |
| `code_patterns.validation_approach` | schema (Zod) + binary inspection                                |
| `conventions.files`                 | kebab-case (`upload-validation.service.ts`)                     |
| `conventions.variables`             | camelCase                                                       |
| `infrastructure.file_storage`       | S3-compatible (MinIO in dev, ArvanCloud later)                  |

### Domain Rules (from Station 13 — Security)

- **Never trust the extension or client `Content-Type`.** Validate by inspecting magic bytes server-side (`file-type`) against the admin-configured allowlist.
- **Decode to confirm.** Attempt a real image decode (`sharp`); reject anything that fails or is malformed.
- **Re-encode before storage.** Re-encode/normalize (strip EXIF and any bytes past the image's logical end — kills polyglots) rather than storing the original bytes.
- **Bound the input.** Enforce a max file size AND a max decoded pixel dimension server-side (decompression-bomb defense), even though the admin config also drives client-side hints.
- **Exclude SVG** from "image" (SVG can carry `<script>`); treat as disallowed unless explicitly sanitized.
- **Allowed types are admin-configurable** and read from `app_config` (see T-013), so FR-005's "no code deploy" requirement holds. This task consumes that config; the admin editing UI is T-140.
- **FR-004 behavior**: a disallowed/invalid upload MUST fail with a clear RFC7807 error and MUST NOT consume a scan or a credit (validation runs before any counter/debit).

### API Context (from contracts/openapi.yaml)

```yaml
# This is a shared validation layer applied by endpoints that accept multipart/form-data:
POST /v1/scans                 (T-020)
POST /v1/plants/{id}/photos    (T-060)
# On rejection → 415 Problem (application/problem+json), no scan/credit consumed.
```

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification + care with a unified AI-credit system. This foundation task provides the single, reusable image-upload validation + normalization + storage service that every photo-accepting endpoint uses, so upload safety and FR-004's "reject bad uploads without cost" rule are enforced in exactly one place.

### Gate Criteria (from Station 13 — Security)

- [ ] Validation runs BEFORE any scan-count increment or credit debit
- [ ] Magic-byte check against admin allowlist (not extension / not client Content-Type)
- [ ] Image decoded and re-encoded (EXIF stripped) before storage
- [ ] File-size and pixel-dimension caps enforced server-side
- [ ] SVG rejected
- [ ] Rejections return RFC7807 with a clear, localizable message key

---

## 🎯 Objective

Provide a reusable server-side upload validation + normalization + storage service (magic-byte allowlist, decode, re-encode, size/pixel caps, SVG-exclusion) used by every photo-accepting endpoint.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/common/uploads/upload-validation.service.ts` - validate (magic bytes vs `app_config` allowlist), decode + re-encode via `sharp`, enforce size/pixel caps, return normalized buffer + metadata
- `backend/src/common/uploads/upload.pipe.ts` - NestJS pipe/guard wrapping the service for multipart handlers
- `backend/src/common/uploads/storage.service.ts` - S3-compatible put/get (randomized `storage_key`, locked-down content-type); MinIO endpoint from env
- `backend/src/common/uploads/upload-validation.service.spec.ts` - unit tests (valid jpeg/png/webp pass; renamed `.exe`, oversized, huge-pixel, and SVG all rejected; verifies no counter side effects)

### Files to Update (REQUIRED)

- `.env.example` - add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_PIXELS`
- `shared/src/index.ts` - export an `AllowedImageType` type consumed by config + frontend hints

### Code/Logic Requirements

- Input: a raw multipart file part. Output: `{ normalizedBuffer, contentType, width, height, bytes }` or throws `UnsupportedMediaTypeException`/`PayloadTooLargeException` mapped to RFC7807.
- Allowlist source: `AppConfigService.getAllowedImageTypes()` (T-013). Default allowlist: `image/jpeg, image/png, image/webp`.
- Pure/stateless: performs NO scan-count or credit mutation. Callers (T-020/T-021, T-060) run this first, then increment/debit only on success.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Component** → Service injected into `ScansModule` (T-020) and `PlantsModule` (T-060) — those tasks own registration; this task exposes an injectable provider in a shared `UploadsModule`.

## ✅ Verification

**Command**: `cd backend && npm test -- upload-validation`
**Success Criteria**: All unit tests pass — valid images normalized; `.exe`-renamed, oversized, pixel-bomb, and SVG inputs rejected with the correct exception; no side effects on rejection.

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
- [ ] Updated traceability.md
