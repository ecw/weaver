import { describe, expect, it } from 'vitest';
import { createGreedySolver } from '../../../../src/solvers/greedy/greedySolver.js';
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

describe('createGreedySolver', () => {
  it('fulfills every request when supply comfortably exceeds demand', async () => {
    const input = baseInput({
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
      ],
      courses: [{ id: 'BIO101', name: 'Biology' }],
      sections: [
        { id: 'BIO-A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 },
      ],
      requests: [
        { id: 'r1', studentId: 's1', courseId: 'BIO101', priority: 'required' },
        { id: 'r2', studentId: 's2', courseId: 'BIO101', priority: 'required' },
      ],
    });

    const result = await createGreedySolver().solve(input);

    expect(result.fulfillmentRate).toBe(1);
    expect(result.unresolvedRequests).toEqual([]);
    expect(result.diagnostics.violations).toEqual([]);
    expect(result.assignments.get('s1')).toEqual(['BIO-A']);
    expect(result.assignments.get('s2')).toEqual(['BIO-A']);
  });

  it('is deterministic given the same input', async () => {
    const input = baseInput({
      students: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, gradeLevel: 10 })),
      courses: [{ id: 'BIO101', name: 'Biology' }],
      sections: [
        { id: 'BIO-A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 5 },
        { id: 'BIO-B', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 5 },
      ],
      requests: Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        studentId: `s${i}`,
        courseId: 'BIO101',
        priority: 'required' as const,
      })),
    });

    const [a, b] = await Promise.all([createGreedySolver().solve(input), createGreedySolver().solve(input)]);
    expect([...a.assignments.entries()].sort()).toEqual([...b.assignments.entries()].sort());
  });

  it('reports a specific, non-empty reason when a request cannot be placed', async () => {
    const input = baseInput({
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
      ],
      courses: [{ id: 'BIO101', name: 'Biology' }],
      sections: [{ id: 'BIO-A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 1 }],
      requests: [
        { id: 'r1', studentId: 's1', courseId: 'BIO101', priority: 'required' },
        { id: 'r2', studentId: 's2', courseId: 'BIO101', priority: 'required' },
      ],
    });

    const result = await createGreedySolver().solve(input);
    expect(result.fulfillmentRate).toBe(0.5);
    expect(result.unresolvedRequests).toHaveLength(1);
    expect(result.unresolvedRequests[0]?.reasons[0]).toMatch(/capacity/);
  });

  it('reports an unresolved request for a grade-ineligible course with no matching sections', async () => {
    const input = baseInput({
      students: [{ id: 's1', name: 'S1', gradeLevel: 6 }],
      courses: [{ id: 'APCALC', name: 'AP Calculus', minGrade: 11 }],
      sections: [{ id: 'AP-A', courseId: 'APCALC', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 10 }],
      requests: [{ id: 'r1', studentId: 's1', courseId: 'APCALC', priority: 'elective' }],
    });

    const result = await createGreedySolver().solve(input);
    expect(result.unresolvedRequests).toHaveLength(1);
    expect(result.unresolvedRequests[0]?.reasons).toEqual(['No eligible section is available for this request']);
  });

  it('resolves a same-student period conflict via backtracking when a second section exists', async () => {
    const input = baseInput({
      students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
      courses: [{ id: 'X', name: 'X' }, { id: 'Y', name: 'Y' }],
      sections: [
        { id: 'X1', courseId: 'X', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 },
        { id: 'X2', courseId: 'X', teacherId: 'T1', termId: 'YEAR', periodId: 'P2', capacity: 30 },
        { id: 'Y1', courseId: 'Y', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 },
      ],
      requests: [
        { id: 'rX', studentId: 's1', courseId: 'X', priority: 'required' },
        { id: 'rY', studentId: 's1', courseId: 'Y', priority: 'required' },
      ],
    });

    const result = await createGreedySolver().solve(input);
    expect(result.fulfillmentRate).toBe(1);
    expect(result.assignments.get('s1')?.sort()).toEqual(['X2', 'Y1'].sort());
  });

  it('honors a cohort rule by placing every member in the same section', async () => {
    const studentIds = ['s1', 's2', 's3'];
    const input = baseInput({
      students: studentIds.map((id) => ({ id, name: id, gradeLevel: 6 })),
      courses: [{ id: 'SCIENCE6', name: 'Science 6' }],
      sections: [
        { id: 'SCI-A', courseId: 'SCIENCE6', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 25 },
        { id: 'SCI-B', courseId: 'SCIENCE6', teacherId: 'T1', termId: 'YEAR', periodId: 'P2', capacity: 25 },
      ],
      requests: studentIds.map((id) => ({
        id: `r-${id}`,
        studentId: id,
        courseId: 'SCIENCE6',
        priority: 'required' as const,
      })),
      rules: [{ type: 'cohort', id: 'team-blue', studentIds, courseId: 'SCIENCE6' }],
    });

    const result = await createGreedySolver().solve(input);
    expect(result.fulfillmentRate).toBe(1);
    const sections = studentIds.map((id) => result.assignments.get(id)?.[0]);
    expect(new Set(sections).size).toBe(1);
  });
});
