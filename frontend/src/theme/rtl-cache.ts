import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

/**
 * Emotion cache configured for RTL output via `stylis-plugin-rtl`.
 *
 * `prefixer` must run before `rtlPlugin` in the stylis plugin pipeline
 * (vendor-prefixing first, then logical/physical flip) — this is the
 * order documented by MUI's own RTL setup guide.
 */
export function createRtlCache() {
  return createCache({
    key: 'muirtl',
    stylisPlugins: [prefixer, rtlPlugin],
  });
}

export default createRtlCache;
