import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

// Import `expect` from `vitest` explicitly (rather than the package's
// `@testing-library/jest-dom/vitest` auto-extend entry point) and extend it
// directly: npm hoists `@testing-library/jest-dom` to the repo root, where
// its own `require('vitest')` would resolve the *backend's* pinned v3
// (workspace version conflict), extending a different `expect` instance
// than the one this workspace's tests actually use.
expect.extend(jestDomMatchers);

// Unmount rendered trees between tests so assertions never leak across cases.
afterEach(() => {
  cleanup();
});
