#!/usr/bin/env node
/**
 * T-191 traceability gate: assert every FR-XXX declared in spec.md maps to a
 * VERIFIED (✅) row in traceability.md. Exits non-zero on any gap — an
 * uncovered requirement, an unmapped FR, or a requirement still in progress.
 *
 * Usage: node scripts/verify-traceability.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, '..', 'specs', '001-plant-id-care-app');
const spec = readFileSync(join(specDir, 'spec.md'), 'utf8');
const matrix = readFileSync(join(specDir, 'traceability.md'), 'utf8');

const DONE = '✅';

// All FR ids declared in the spec (deduped, sorted).
const specFrs = [...new Set([...spec.matchAll(/\bFR-(\d{3})\b/g)].map((m) => `FR-${m[1]}`))].sort();

// FR ids that appear in a traceability row whose Status cell is ✅ Done.
const verified = new Set();
const mapped = new Set();
for (const line of matrix.split('\n')) {
  const m = line.match(/\|\s*(FR-\d{3})\s*\|/);
  if (!m) continue;
  mapped.add(m[1]);
  // Status is the last non-empty cell of the row.
  const cells = line.split('|').map((c) => c.trim());
  const status = cells[cells.length - 2] ?? '';
  if (status.includes(DONE)) verified.add(m[1]);
}

const unmapped = specFrs.filter((fr) => !mapped.has(fr));
const unverified = specFrs.filter((fr) => mapped.has(fr) && !verified.has(fr));

const total = specFrs.length;
const ok = total - unmapped.length - unverified.length;
console.log(`Traceability gate: ${ok}/${total} requirements verified.`);

if (unmapped.length > 0) {
  console.error(`\n✗ Unmapped requirements (no row in traceability.md): ${unmapped.join(', ')}`);
}
if (unverified.length > 0) {
  console.error(`\n✗ Mapped but not verified (status not ✅): ${unverified.join(', ')}`);
}

if (unmapped.length > 0 || unverified.length > 0) {
  console.error('\nTraceability gate FAILED.');
  process.exit(1);
}
console.log('Traceability gate PASSED — 100% of requirements are verified.');
