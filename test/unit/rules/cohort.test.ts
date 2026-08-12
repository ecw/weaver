import { describe, expect, it } from 'vitest';
import { createCohortRule } from '../../../src/rules/cohort.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const sciA = { id: 'SCI-A', courseId: 'SCIENCE6', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 };
const sciB = { id: 'SCI-B', courseId: 'SCIENCE6', teacherId: 'T2', termId: 'YEAR', periodId: 'P2', capacity: 30 };

const students = ['s1', 's2', 's3'];
const ctx = buildContext({
  sections: [sciA, sciB],
  students: students.map((id) => ({ id, name: id, gradeLevel: 6 })),
  requests: students.map((id) => ({ id: `r-${id}`, studentId: id, courseId: 'SCIENCE6', priority: 'required' as const })),
  terms: [year],
});

describe('createCohortRule', () => {
  const rule = createCohortRule('team1', students, 'SCIENCE6');

  it('allows the first cohort member to be placed anywhere', () => {
    const partial = freshPartial();
    expect(rule.checkFeasible(ctx, partial, 's1', 'r-s1', sciA).feasible).toBe(true);
  });

  it('allows a subsequent member into the same section as the first', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'r-s1', sciA.id);
    expect(rule.checkFeasible(ctx, partial, 's2', 'r-s2', sciA).feasible).toBe(true);
  });

  it('rejects a subsequent member being placed in a different section', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'r-s1', sciA.id);
    const result = rule.checkFeasible(ctx, partial, 's2', 'r-s2', sciB);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/conflicts with cohort member/);
  });

  it('does not apply to students outside the cohort', () => {
    const outsideCtx = buildContext({
      sections: [sciA, sciB],
      students: [...students, 'outsider'].map((id) => ({ id, name: id, gradeLevel: 6 })),
      requests: [
        ...students.map((id) => ({ id: `r-${id}`, studentId: id, courseId: 'SCIENCE6', priority: 'required' as const })),
        { id: 'r-outsider', studentId: 'outsider', courseId: 'SCIENCE6', priority: 'required' as const },
      ],
      terms: [year],
    });
    const partial = freshPartial();
    assign(partial, 's1', 'r-s1', sciA.id);
    expect(rule.checkFeasible(outsideCtx, partial, 'outsider', 'r-outsider', sciB).feasible).toBe(true);
  });

  it('forces every cohort member onto the same section as the leader in the MIP model', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', sciA.id);
    vars.varName('s1', sciB.id);
    vars.varName('s2', sciA.id);
    vars.varName('s2', sciB.id);
    vars.varName('s3', sciA.id);
    vars.varName('s3', sciB.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    // Leader s1 vs {s2, s3}, each across {sciA, sciB} => 4 equality constraints.
    expect(built.constraints).toHaveLength(4);
    expect(built.constraints.every((c) => c.sense === '=' && c.rhs === 0)).toBe(true);
  });
});
