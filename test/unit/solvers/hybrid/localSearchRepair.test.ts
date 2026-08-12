import { describe, expect, it } from 'vitest';
import { runLocalSearchRepair } from '../../../../src/solvers/hybrid/localSearchRepair.js';
import { createBuiltinRules } from '../../../../src/rules/builtins.js';
import { assign, sectionOf } from '../../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from '../../rules/testFixtures.js';
import type { Term, StudentRequest } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };

describe('runLocalSearchRepair', () => {
  it('resolves a 1-hop swap: bumps the occupant into their own empty alternate section', () => {
    const p1 = { id: 'P1', courseId: 'P', teacherId: 'T1', termId: 'YEAR', periodId: 'PER1', capacity: 1 };
    const p2 = { id: 'P2', courseId: 'P', teacherId: 'T2', termId: 'YEAR', periodId: 'PER2', capacity: 1 };
    // X prefers P1's teacher specifically, so ranking tries the full P1 before the empty P2 --
    // otherwise X would just take the trivially-empty P2 directly and no swap would happen at all.
    const rX: StudentRequest = { id: 'rX', studentId: 'x', courseId: 'P', priority: 'required', requestedTeacherId: 'T1' };
    const rO1: StudentRequest = { id: 'rO1', studentId: 'o1', courseId: 'P', priority: 'required' };
    const ctx = buildContext({
      courses: [{ id: 'P', name: 'P' }],
      sections: [p1, p2],
      students: [
        { id: 'x', name: 'X', gradeLevel: 10 },
        { id: 'o1', name: 'O1', gradeLevel: 10 },
      ],
      requests: [rX, rO1],
      terms: [year],
    });
    const requestsById = new Map<string, StudentRequest>([
      ['rX', rX],
      ['rO1', rO1],
    ]);

    const partial = freshPartial();
    assign(partial, 'o1', 'rO1', p1.id); // P1 full; P2 empty.

    const stillUnresolved = runLocalSearchRepair(
      ctx,
      partial,
      createBuiltinRules(),
      requestsById,
      [{ requestId: 'rX', studentId: 'x', courseId: 'P', reasons: ['at capacity'] }],
    );

    expect(stillUnresolved).toEqual([]);
    expect(sectionOf(partial, 'x', 'rX')).toBe(p1.id);
    expect(sectionOf(partial, 'o1', 'rO1')).toBe(p2.id);
  });

  it('resolves a genuine 2-hop chain and never double-books the intermediate seat', () => {
    // Three sections of the same course. P3 is left genuinely empty -- but each student's
    // teacher preference is set so ranking forces them down the intended P1 -> P2 -> P3 chain
    // instead of anyone just grabbing the trivially-empty P3 directly, exercising real depth-2
    // recursion (and the visitedSections guard that stops the freed P1 from being reclaimed
    // mid-chain by O2 instead of ending up with X, per its outer call).
    const p1 = { id: 'P1', courseId: 'P', teacherId: 'T1', termId: 'YEAR', periodId: 'PER1', capacity: 1 };
    const p2 = { id: 'P2', courseId: 'P', teacherId: 'T2', termId: 'YEAR', periodId: 'PER2', capacity: 1 };
    const p3 = { id: 'P3', courseId: 'P', teacherId: 'T3', termId: 'YEAR', periodId: 'PER3', capacity: 1 };

    const rX: StudentRequest = { id: 'rX', studentId: 'x', courseId: 'P', priority: 'required', requestedTeacherId: 'T1' };
    const rO1: StudentRequest = { id: 'rO1', studentId: 'o1', courseId: 'P', priority: 'required', requestedTeacherId: 'T2' };
    const rO2: StudentRequest = { id: 'rO2', studentId: 'o2', courseId: 'P', priority: 'required' };

    const ctx = buildContext({
      courses: [{ id: 'P', name: 'P' }],
      sections: [p1, p2, p3],
      students: [
        { id: 'x', name: 'X', gradeLevel: 10 },
        { id: 'o1', name: 'O1', gradeLevel: 10 },
        { id: 'o2', name: 'O2', gradeLevel: 10 },
      ],
      requests: [rX, rO1, rO2],
      terms: [year],
    });
    const requestsById = new Map<string, StudentRequest>([
      ['rX', rX],
      ['rO1', rO1],
      ['rO2', rO2],
    ]);

    const partial = freshPartial();
    assign(partial, 'o1', 'rO1', p1.id);
    assign(partial, 'o2', 'rO2', p2.id);
    // p3 stays empty.

    const stillUnresolved = runLocalSearchRepair(
      ctx,
      partial,
      createBuiltinRules(),
      requestsById,
      [{ requestId: 'rX', studentId: 'x', courseId: 'P', reasons: ['at capacity'] }],
    );

    expect(stillUnresolved).toEqual([]);
    expect(sectionOf(partial, 'x', 'rX')).toBe(p1.id);
    expect(sectionOf(partial, 'o1', 'rO1')).toBe(p2.id);
    expect(sectionOf(partial, 'o2', 'rO2')).toBe(p3.id);

    // Every seat used exactly once -- no double-booking introduced by the chain.
    const usedSections = [sectionOf(partial, 'x', 'rX'), sectionOf(partial, 'o1', 'rO1'), sectionOf(partial, 'o2', 'rO2')];
    expect(new Set(usedSections).size).toBe(3);
  });

  it('leaves a request unresolved (and rolls back any tentative moves) when no chain exists', () => {
    const p1 = { id: 'P1', courseId: 'P', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 1 };
    const ctx = buildContext({
      courses: [{ id: 'P', name: 'P' }],
      sections: [p1],
      students: [
        { id: 'x', name: 'X', gradeLevel: 10 },
        { id: 'o1', name: 'O1', gradeLevel: 10 },
      ],
      requests: [
        { id: 'rX', studentId: 'x', courseId: 'P', priority: 'required' },
        { id: 'rO1', studentId: 'o1', courseId: 'P', priority: 'required' },
      ],
      terms: [year],
    });
    const requestsById = new Map<string, StudentRequest>([
      ['rX', { id: 'rX', studentId: 'x', courseId: 'P', priority: 'required' }],
      ['rO1', { id: 'rO1', studentId: 'o1', courseId: 'P', priority: 'required' }],
    ]);

    const partial = freshPartial();
    assign(partial, 'o1', 'rO1', p1.id);

    const stillUnresolved = runLocalSearchRepair(
      ctx,
      partial,
      createBuiltinRules(),
      requestsById,
      [{ requestId: 'rX', studentId: 'x', courseId: 'P', reasons: ['at capacity'] }],
    );

    expect(stillUnresolved).toHaveLength(1);
    expect(sectionOf(partial, 'x', 'rX')).toBeUndefined();
    expect(sectionOf(partial, 'o1', 'rO1')).toBe(p1.id); // untouched
  });
});
