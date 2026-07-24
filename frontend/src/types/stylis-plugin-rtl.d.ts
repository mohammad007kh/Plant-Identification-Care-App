/**
 * `stylis-plugin-rtl` does not ship its own TypeScript declarations and has
 * no `@types/stylis-plugin-rtl` package on DefinitelyTyped. This ambient
 * declaration keeps `import rtlPlugin from 'stylis-plugin-rtl'`
 * (used in `src/theme/rtl-cache.ts`) from failing strict type-checking.
 */
declare module 'stylis-plugin-rtl';
