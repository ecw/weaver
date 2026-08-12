import { describe, expect, it } from 'vitest';
import { createMipSolver } from '../../../../src/solvers/mip/mipSolver.js';
import type { SchedulingInput } from '../../../../src/types/solver.js';
import type { Term } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };

function baseInput(overrides: Partial<SchedulingInput> = {}): SchedulingInput {
  return {
    students: [],
    requests: [],
    sections: [],
    courses: [],
    teachers: [{ id: 'T1', name: 'Teacher One' }],
    terms: [year],
    periods: [{ id: 'P1', name: 'Period 1', sortOrder: 1 }],
    rules: [],
    ...overrides,
  };
}

describe('createMipSolver', () => {
  it('fulfills every request when supply comfortably exceeds demand and reports an Optimal status', async () => {
    const input = baseInput({
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
      ],
      courses: [{ id: 'BIO101', name: 'Biology' }],
      sections: [{ id: 'BIO-A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 }],
      requests: [
        { id: 'r1', studentId: 's1', courseId: 'BIO101', priority: 'required' },
        { id: 'r2', studentId: 's2', courseId: 'BIO101', priority: 'required' },
      ],
    });

    const result = await createMipSolver().solve(input);

    expect(result.fulfillmentRate).toBe(1);
    expect(result.diagnostics.violations).toEqual([]);
    expect(result.diagnostics.solverStatus).toBe('Optimal');
    expect(result.assignments.get('s1')).toEqual(['BIO-A']);
    expect(result.assignments.get('s2')).toEqual(['BIO-A']);
  }, 20000);

  it('optimizes for the higher-weighted (required) request when capacity forces a choice', async () => {
    const input = baseInput({
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
      ],
      courses: [{ id: 'ART', name: 'Art' }],
      sections: [{ id: 'ART-A', courseId: 'ART', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 1 }],
      requests: [
        { id: 'rRequired', studentId: 's1', courseId: 'ART', priority: 'required' },
        { id: 'rElective', studentId: 's2', courseId: 'ART', priority: 'elective' },
      ],
    });

    const result = await createMipSolver().solve(input);

    expect(result.fulfillmentRate).toBe(0.5);
    expect(result.assignments.get('s1')).toEqual(['ART-A']);
    expect(result.assignments.get('s2') ?? []).toEqual([]);
    expect(result.unresolvedRequests).toHaveLength(1);
    expect(result.unresolvedRequests[0]?.requestId).toBe('rElective');
  }, 20000);

  it('enforces a mutual-exclusion rule and produces zero post-hoc violations', async () => {
    const input = baseInput({
      students: [{ id: 's1', name: 'S1', gradeLevel: 9 }],
      courses: [
        { id: 'SPANISH1', name: 'Spanish I' },
        { id: 'FRENCH1', name: 'French I' },
      ],
      sections: [
        { id: 'SPAN-A', courseId: 'SPANISH1', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 },
        { id: 'FR-A', courseId: 'FRENCH1', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 },
      ],
      requests: [
        { id: 'rSpan', studentId: 's1', courseId: 'SPANISH1', priority: 'required' },
        { id: 'rFrench', studentId: 's1', courseId: 'FRENCH1', priority: 'required' },
      ],
      rules: [{ type: 'mutualExclusion', id: 'excl1', courseIdA: 'SPANISH1', courseIdB: 'FRENCH1' }],
    });

    const result = await createMipSolver().solve(input);

    expect(result.diagnostics.violations).toEqual([]);
    expect(result.assignments.get('s1')?.length).toBeLessThanOrEqual(1);
    expect(result.fulfillmentRate).toBe(0.5);
  }, 20000);

  it('respects section capacity exactly (never over-enrolls)', async () => {
    const students = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, gradeLevel: 10 }));
    const input = baseInput({
      students,
      courses: [{ id: 'BIO101', name: 'Biology' }],
      sections: [{ id: 'BIO-A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 3 }],
      requests: students.map((s) => ({
        id: `r-${s.id}`,
        studentId: s.id,
        courseId: 'BIO101',
        priority: 'required' as const,
      })),
    });

    const result = await createMipSolver().solve(input);
    const util = result.sectionUtilization.find((u) => u.sectionId === 'BIO-A');
    expect(util?.enrolled).toBe(3);
    expect(result.unresolvedRequests).toHaveLength(2);
    expect(result.diagnostics.violations).toEqual([]);
  }, 20000);
});
