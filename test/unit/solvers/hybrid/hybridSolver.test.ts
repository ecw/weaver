import { describe, expect, it } from 'vitest';
import { createHybridSolver } from '../../../../src/solvers/hybrid/hybridSolver.js';
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
    teachers: [{ id: 'T1', name: 'Teacher One' }, { id: 'T2', name: 'Teacher Two' }],
    terms: [year],
    periods: [{ id: 'P1', name: 'Period 1', sortOrder: 1 }],
    rules: [],
    ...overrides,
  };
}

describe('createHybridSolver', () => {
  it('resolves a cross-student period conflict that greedy construction alone cannot (only same-student conflicts are backtrackable)', async () => {
    // Student "a" wants only course Y. Student "b" wants course X (one section, no alternate)
    // and course Y. Y_B shares X1's period, so b can only take Y through Y_A -- but greedy
    // processes a's single, unconstrained Y-request first and (with nothing to prefer one
    // section over the other) happens to claim Y_A, leaving only the conflicting Y_B for b.
    // Bounded backtracking can't fix this: it only retries the *same* student's own prior
    // assignment, and b's only other assignment (X1) has no alternate section to move to
    // either. Untangling it requires noticing that "a" has no reason to be in Y_A specifically
    // and moving them to Y_B -- exactly the kind of cross-student reshuffle the repair solvers
    // (MIP repair / local-search swaps) exist for.
    const x1 = { id: 'X1', courseId: 'X', teacherId: 'T1', termId: 'YEAR', periodId: 'PER1', capacity: 1 };
    const yA = { id: 'Y_A', courseId: 'Y', teacherId: 'T2', termId: 'YEAR', periodId: 'PER2', capacity: 1 };
    const yB = { id: 'Y_B', courseId: 'Y', teacherId: 'T2', termId: 'YEAR', periodId: 'PER1', capacity: 1 };
    const students = [
      { id: 'a', name: 'A', gradeLevel: 10 },
      { id: 'b', name: 'B', gradeLevel: 10 },
    ];
    const input = baseInput({
      students,
      courses: [{ id: 'X', name: 'X' }, { id: 'Y', name: 'Y' }],
      sections: [x1, yA, yB],
      requests: [
        { id: 'rYa', studentId: 'a', courseId: 'Y', priority: 'required' },
        { id: 'rXb', studentId: 'b', courseId: 'X', priority: 'required' },
        { id: 'rYb', studentId: 'b', courseId: 'Y', priority: 'required' },
      ],
    });

    const greedyResult = await createGreedySolver().solve(input);
    // Confirms the scenario is a real trap for greedy alone, not a coincidentally-easy case.
    expect(greedyResult.fulfillmentRate).toBeLessThan(1);

    const hybridResult = await createHybridSolver().solve(input);
    expect(hybridResult.fulfillmentRate).toBeGreaterThan(greedyResult.fulfillmentRate);
    expect(hybridResult.fulfillmentRate).toBe(1);
    expect(hybridResult.assignments.get('b')?.sort()).toEqual(['X1', 'Y_A'].sort());
    expect(hybridResult.diagnostics.violations).toEqual([]);
  }, 20000);

  it('reports genuinely unresolved requests when total capacity is insufficient', async () => {
    const input = baseInput({
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
      ],
      courses: [{ id: 'ART', name: 'Art' }],
      sections: [{ id: 'ART-A', courseId: 'ART', teacherId: 'T1', termId: 'YEAR', periodId: 'PER1', capacity: 1 }],
      requests: [
        { id: 'r1', studentId: 's1', courseId: 'ART', priority: 'required' },
        { id: 'r2', studentId: 's2', courseId: 'ART', priority: 'required' },
      ],
    });

    const result = await createHybridSolver().solve(input);

    expect(result.fulfillmentRate).toBe(0.5);
    expect(result.unresolvedRequests).toHaveLength(1);
    expect(result.unresolvedRequests[0]?.reasons.length).toBeGreaterThan(0);
    expect(result.diagnostics.violations).toEqual([]);
  }, 20000);

  it('honors a cohort rule end-to-end, even under a repair round', async () => {
    const studentIds = ['s1', 's2', 's3'];
    const input = baseInput({
      students: studentIds.map((id) => ({ id, name: id, gradeLevel: 6 })),
      courses: [{ id: 'SCIENCE6', name: 'Science 6' }],
      sections: [
        { id: 'SCI-A', courseId: 'SCIENCE6', teacherId: 'T1', termId: 'YEAR', periodId: 'PER1', capacity: 25 },
        { id: 'SCI-B', courseId: 'SCIENCE6', teacherId: 'T1', termId: 'YEAR', periodId: 'PER2', capacity: 25 },
      ],
      requests: studentIds.map((id) => ({
        id: `r-${id}`,
        studentId: id,
        courseId: 'SCIENCE6',
        priority: 'required' as const,
      })),
      rules: [{ type: 'cohort', id: 'team-blue', studentIds, courseId: 'SCIENCE6' }],
    });

    const result = await createHybridSolver().solve(input);

    expect(result.fulfillmentRate).toBe(1);
    const sections = studentIds.map((id) => result.assignments.get(id)?.[0]);
    expect(new Set(sections).size).toBe(1);
    expect(result.diagnostics.violations).toEqual([]);
  }, 20000);
}, 30000);
