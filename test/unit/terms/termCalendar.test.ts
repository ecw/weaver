import { describe, expect, it } from 'vitest';
import {
  termContains,
  termFullyAfter,
  termFullyBefore,
  termsOverlap,
} from '../../../src/terms/termCalendar.js';
import type { Term } from '../../../src/types/domain.js';

function term(id: string, startUnit: number, endUnit: number, parentId: string | null = null): Term {
  return { id, name: id, type: 'custom', parentId, startUnit, endUnit };
}

describe('termCalendar', () => {
  const fullYear = term('year', 1, 12);
  const semester1 = term('s1', 1, 6, 'year');
  const semester2 = term('s2', 7, 12, 'year');
  const q1 = term('q1', 1, 3, 's1');
  const q2 = term('q2', 4, 6, 's1');
  const q3 = term('q3', 7, 9, 's2');

  describe('termsOverlap', () => {
    it('a year-long term overlaps every semester and quarter within it', () => {
      expect(termsOverlap(fullYear, semester1)).toBe(true);
      expect(termsOverlap(fullYear, semester2)).toBe(true);
      expect(termsOverlap(fullYear, q1)).toBe(true);
      expect(termsOverlap(fullYear, q3)).toBe(true);
    });

    it('two semesters in the same year do not overlap', () => {
      expect(termsOverlap(semester1, semester2)).toBe(false);
    });

    it('two adjacent quarters do not overlap at the boundary', () => {
      expect(termsOverlap(q1, q2)).toBe(false);
    });

    it('a term overlaps itself', () => {
      expect(termsOverlap(q1, q1)).toBe(true);
    });

    it('is symmetric', () => {
      expect(termsOverlap(q1, fullYear)).toBe(termsOverlap(fullYear, q1));
    });
  });

  describe('termContains', () => {
    it('year contains its semesters and quarters', () => {
      expect(termContains(fullYear, semester1)).toBe(true);
      expect(termContains(fullYear, q1)).toBe(true);
    });

    it('a quarter does not contain its parent semester', () => {
      expect(termContains(q1, semester1)).toBe(false);
    });

    it('semester1 does not contain a quarter from semester2', () => {
      expect(termContains(semester1, q3)).toBe(false);
    });
  });

  describe('termFullyBefore / termFullyAfter', () => {
    it('q1 is fully before q2 (adjacent, non-overlapping)', () => {
      expect(termFullyBefore(q1, q2)).toBe(true);
      expect(termFullyAfter(q2, q1)).toBe(true);
    });

    it('semester1 is fully before semester2', () => {
      expect(termFullyBefore(semester1, semester2)).toBe(true);
    });

    it('overlapping terms are neither fully before nor fully after', () => {
      expect(termFullyBefore(fullYear, semester1)).toBe(false);
      expect(termFullyAfter(fullYear, semester1)).toBe(false);
    });

    it('a term is not fully before itself', () => {
      expect(termFullyBefore(q1, q1)).toBe(false);
    });
  });
});
