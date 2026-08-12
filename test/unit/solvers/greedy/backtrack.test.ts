import { describe, expect, it } from 'vitest';
import { tryBoundedBacktrack } from '../../../../src/solvers/greedy/backtrack.js';
import { generateCandidates } from '../../../../src/candidates/candidateGenerator.js';
import { assign, sectionOf } from '../../../../src/rules/partialAssignment.js';
import { createBuiltinRules } from '../../../../src/rules/builtins.js';
import { buildContext, freshPartial } from '../../rules/testFixtures.js';
import type { Term } from '../../../../src/types/domain.js';
import type { RequestId } from '../../../../src/types/ids.js';
import type { StudentRequest } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };

// Course X has two sections (different periods); course Y has one section that only fits in P1,
// the same period as X's first section. Placing X first into X1 (P1) blocks Y; backtracking should
// move X to X2 (P2) and let Y take Y1 (P1).
const x1 = { id: 'X1', courseId: 'X', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 };
const x2 = { id: 'X2', courseId: 'X', teacherId: 'T1', termId: 'YEAR', periodId: 'P2', capacity: 30 };
const y1 = { id: 'Y1', courseId: 'Y', teacherId: 'T2', termId: 'YEAR', periodId: 'P1', capacity: 30 };

const rX: StudentRequest = { id: 'rX', studentId: 's1', courseId: 'X', priority: 'required' };
const rY: StudentRequest = { id: 'rY', studentId: 's1', courseId: 'Y', priority: 'required' };

const ctx = buildContext({
  courses: [{ id: 'X', name: 'X' }, { id: 'Y', name: 'Y' }],
  sections: [x1, x2, y1],
  students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
  requests: [rX, rY],
  terms: [year],
});

describe('tryBoundedBacktrack', () => {
  it('frees a conflicting same-student assignment and re-homes it elsewhere', () => {
    const rules = createBuiltinRules();
    const requestsById = new Map<RequestId, StudentRequest>([
      [rX.id, rX],
      [rY.id, rY],
    ]);

    const partial = freshPartial();
    // Simulate X having already been greedily placed into X1 (its only-considered candidate at the time).
    assign(partial, 's1', rX.id, x1.id);

    const yCandidates = generateCandidates(
      ctx.sectionsByCourse.get('Y') ?? [],
      rY,
      ctx.students.get('s1')!,
      ctx.courses.get('Y')!,
    );

    const succeeded = tryBoundedBacktrack(ctx, partial, rules, rY, yCandidates, requestsById);

    expect(succeeded).toBe(true);
    expect(sectionOf(partial, 's1', rY.id)).toBe(y1.id);
    expect(sectionOf(partial, 's1', rX.id)).toBe(x2.id);
  });

  it('returns false and leaves state untouched when there is nothing backtrackable', () => {
    const rules = createBuiltinRules();
    const requestsById = new Map<RequestId, StudentRequest>([[rY.id, rY]]);
    const partial = freshPartial();

    const yCandidates = generateCandidates(
      ctx.sectionsByCourse.get('Y') ?? [],
      rY,
      ctx.students.get('s1')!,
      ctx.courses.get('Y')!,
    );

    // No conflicting assignment exists yet, so every candidate is already feasible --
    // nothing for backtracking to do (checkAllRules never returns conflictingRequestId).
    const succeeded = tryBoundedBacktrack(ctx, partial, rules, rY, yCandidates, requestsById);
    expect(succeeded).toBe(false);
    expect(sectionOf(partial, 's1', rY.id)).toBeUndefined();
  });
});
