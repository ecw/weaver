import { describe, expect, it } from 'vitest';
import { createGradeEligibilityRule } from '../../../src/rules/gradeEligibility.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const apCalc = { id: 'APCALC-A', courseId: 'APCALC', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 20 };

const ctx = buildContext({
  courses: [{ id: 'APCALC', name: 'AP Calculus', minGrade: 11, maxGrade: 12 }],
  sections: [apCalc],
  students: [
    { id: 'freshman', name: 'Freshman', gradeLevel: 9 },
    { id: 'senior', name: 'Senior', gradeLevel: 12 },
  ],
  terms: [year],
});

describe('createGradeEligibilityRule', () => {
  const rule = createGradeEligibilityRule();

  it('rejects a student below the minimum grade', () => {
    const result = rule.checkFeasible(ctx, freshPartial(), 'freshman', 'r1', apCalc);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/outside/);
  });

  it('allows an eligible student', () => {
    const result = rule.checkFeasible(ctx, freshPartial(), 'senior', 'r2', apCalc);
    expect(result.feasible).toBe(true);
  });
});
