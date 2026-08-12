/** Deduplicates the reasons collected while trying (and failing) to place a request, with a safe fallback. */
export function summarizeReasons(reasons: string[]): string[] {
  const unique = [...new Set(reasons)];
  return unique.length > 0 ? unique : ['No eligible section is available for this request'];
}
