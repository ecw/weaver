import type { Term } from '../types/domain.js';

/**
 * Every term is placed on a shared timeline of atomic scheduling units.
 * 12 units/year is the library default: it divides cleanly into semesters (6),
 * trimesters (4), quarters (3), and months (1), so schools with any of those
 * calendar structures can express terms without a custom unit count.
 */
export const DEFAULT_UNITS_PER_YEAR = 12;

export function termsOverlap(a: Term, b: Term): boolean {
  return a.startUnit <= b.endUnit && b.startUnit <= a.endUnit;
}

export function termContains(outer: Term, inner: Term): boolean {
  return outer.startUnit <= inner.startUnit && inner.endUnit <= outer.endUnit;
}

export function termFullyBefore(a: Term, b: Term): boolean {
  return a.endUnit < b.startUnit;
}

export function termFullyAfter(a: Term, b: Term): boolean {
  return a.startUnit > b.endUnit;
}
