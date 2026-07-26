// Minimal local ambient augmentation for the `@testing-library/jest-dom`
// matchers used in this workspace's tests (see `vitest.setup.ts` for the
// runtime `expect.extend`).
//
// We deliberately do NOT use the package's own `@testing-library/jest-dom/vitest`
// type-augmentation entry point: that file's `declare module 'vitest'` block
// resolves `vitest` relative to *its own* location. `@testing-library/jest-dom`
// is hoisted to the repo root by npm workspaces, so from there `vitest`
// resolves to the root's hoisted copy — the *backend's* pinned `^3.0.4` — not
// this workspace's nested `^4.1.10` that `scan-flow.test.tsx` actually
// imports. TypeScript treats those as two distinct module identities, so the
// upstream augmentation silently doesn't merge into the `Assertion` interface
// our tests see. Declaring it here instead resolves `vitest` through this
// workspace's own `node_modules`, so it augments the right module.
import 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toBeDisabled(): T;
    toHaveTextContent(text: string | RegExp): T;
  }
}
