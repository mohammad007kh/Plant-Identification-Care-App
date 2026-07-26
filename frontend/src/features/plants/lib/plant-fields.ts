/**
 * `species`/`photos` are typed `unknown`/`unknown[]` in the shared `Plant`
 * contract (`shared/src/contracts/plant.ts`) — their dedicated schemas land
 * in a later task — so every field read from them here is defensive: an
 * unexpected/missing shape degrades to "field omitted", never a crash.
 * Mirrors the same pattern already used for `ScanJob.species`/`careGuide` in
 * `features/scan/components/scan-result.tsx`.
 */
export function readStringField(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Same defensive read as `readStringField`, without narrowing to `string`. */
export function readUnknownField(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
}

/** Structured care-guide fields (`data-model.md` `care_guide` jsonb — US3). */
export const CARE_GUIDE_FIELD_KEYS = [
  'watering',
  'light',
  'soil',
  'humidity',
  'temperature',
  'notes',
] as const;
export type CareGuideFieldKey = (typeof CARE_GUIDE_FIELD_KEYS)[number];
