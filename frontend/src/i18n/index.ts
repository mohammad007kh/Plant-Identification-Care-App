import fa from './fa.json';

/**
 * Locales shipped today. v1 ships Persian (`fa`) only (FR-029, spec.md
 * Assumption #2); the union type + catalog map below are structured so a
 * second locale can be added later without changing any call site:
 *   1. add `frontend/src/i18n/en.json` (same key shape as `fa.json`)
 *   2. `import en from './en.json'`
 *   3. add `'en'` to `Locale` and `en` to `catalogs`
 */
export type Locale = 'fa';

export type Messages = typeof fa;

const catalogs: Record<Locale, Messages> = {
  fa,
};

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

export const defaultLocale: Locale = 'fa';
