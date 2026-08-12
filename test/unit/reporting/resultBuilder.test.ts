import { describe, expect, it } from 'vitest';
import { buildScheduleResult } from '../../../src/reporting/resultBuilder.js';
import { assign, createPartialAssignment } from '../../../src/rules/partialAssignment.js';
import { createBuiltinRules } from '../../../src/rules/builtins.js';
import { buildContext } from '../rules/testFixtures.js';
import type { SchedulingInput } from '../../../src/types/solver.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const secA = { id: 'A', courseId: 'BIO', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 2 };
const secB = { id: 'B', courseId: 'CHEM', teacherId: 'T2', termId: 'YEAR', periodId: 'P1', capacity: 2 };

const input: SchedulingInput = {
  students: [
    { id: 's1', name: 'S1', gradeLevel: 10 },
    { id: 's2', name: 'S2', gradeLevel: 10 },
  ],
  requests: [
    { id: 'r1', studentId: 's1', courseId: 'BIO', priority: 'required' },
    { id: 'r2', studentId: 's2', courseId: 'BIO', priority: 'required' },
    { id: 'r3', studentId: 's2', courseId: 'CHEM', priority: 'required' },
  ],
  sections: [secA, secB],
  courses: [{ id: 'BIO', name: 'Biology' }, { id: 'CHEM', name: 'Chemistry' }],
  teachers: [{ id: 'T1', name: 'T1' }, { id: 'T2', name: 'T2' }],
  terms: [year],
  periods: [{ id: 'P1', name: 'Period 1', sortOrder: 1 }],
  rules: [],
};

const ctx = buildContext({
  courses: input.courses,
  sections: input.sections,
  students: input.students,
  requests: input.requests,
  terms: input.terms,
  teachers: input.teachers,
});

describe('buildScheduleResult', () => {
  it('computes fulfillment rate, utilization, and reports zero violations for a clean assignment', () => {
    const partial = createPartialAssignment();
    assign(partial, 's1', 'r1', secA.id);
    assign(partial, 's2', 'r2', secA.id);
    // r3 (CHEM) deliberately left unresolved.

    const result = buildScheduleResult({
      solverName: 'test',
      ctx,
      input,
      partial,
      unresolvedRequests: [{ requestId: 'r3', studentId: 's2', courseId: 'CHEM', reasons: ['no room'] }],
      rules: createBuiltinRules(),
      durationMs: 12,
    });

    expect(result.fulfillmentRate).toBeCloseTo(2 / 3);
    expect(result.fulfilledRequests).toHaveLength(2);
    expect(result.assignments.get('s1')).toEqual(['A']);

    const utilA = result.sectionUtilization.find((u) => u.sectionId === 'A');
    expect(utilA).toEqual({ sectionId: 'A', capacity: 2, enrolled: 2, utilizationRate: 1 });
    const utilB = result.sectionUtilization.find((u) => u.sectionId === 'B');
    expect(utilB).toEqual({ sectionId: 'B', capacity: 2, enrolled: 0, utilizationRate: 0 });

    expect(result.diagnostics.violations).toEqual([]);
    expect(result.diagnostics.durationMs).toBe(12);
  });

  it('flags a hard-constraint violation when an assignment breaks a rule (e.g. over capacity)', () => {
    const partial = createPartialAssignment();
    // Force 3 students into a capacity-2 section by assigning directly, bypassing the solver's own checks,
    // to prove the post-hoc validation pass actually catches it rather than trusting the input.
    assign(partial, 's1', 'r1', secA.id);
    assign(partial, 's2', 'r2', secA.id);
    const overCapacityInput: SchedulingInput = {
      ...input,
      students: [...input.students, { id: 's3', name: 'S3', gradeLevel: 10 }],
    };
    assign(partial, 's3', 'r-extra', secA.id);
    const overCtx = buildContext({
      courses: input.courses,
      sections: input.sections,
      students: overCapacityInput.students,
      requests: [...input.requests, { id: 'r-extra', studentId: 's3', courseId: 'BIO', priority: 'required' }],
      terms: input.terms,
      teachers: input.teachers,
    });

    const result = buildScheduleResult({
      solverName: 'test',
      ctx: overCtx,
      input: overCapacityInput,
      partial,
      unresolvedRequests: [],
      rules: createBuiltinRules(),
      durationMs: 1,
    });

    expect(result.diagnostics.violations.length).toBeGreaterThan(0);
    expect(result.diagnostics.violations[0]).toMatch(/at capacity|violation/);
  });

  it('treats an empty request list as 100% fulfilled', () => {
    const emptyInput: SchedulingInput = { ...input, requests: [] };
    const result = buildScheduleResult({
      solverName: 'test',
      ctx,
      input: emptyInput,
      partial: createPartialAssignment(),
      unresolvedRequests: [],
      rules: [],
      durationMs: 0,
    });
    expect(result.fulfillmentRate).toBe(1);
  });
});
