/** True if `err` is (or wraps) a Postgres unique-violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  const codes = new Set<string>();
  let cursor: unknown = err;
  for (let depth = 0; cursor && depth < 5; depth += 1) {
    const code = (cursor as { code?: unknown }).code;
    if (typeof code === 'string') codes.add(code);
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return codes.has('23505');
}
