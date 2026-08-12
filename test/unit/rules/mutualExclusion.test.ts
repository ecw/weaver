import { describe, expect, it } from 'vitest';
import { createMutualExclusionRule } from '../../../src/rules/mutualExclusion.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const spanA = { id: 'SPAN-A', courseId: 'SPANISH1', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 20 };
const frenchA = { id: 'FR-A', courseId: 'FRENCH1', teacherId: 'T2', termId: 'YEAR', periodId: 'P2', capacity: 20 };

const ctx = buildContext({
  sections: [spanA, frenchA],
  students: [{ id: 's1', name: 'S1', gradeLevel: 9 }],
  requests: [
    { id: 'rSpan', studentId: 's1', courseId: 'SPANISH1', priority: 'elective' },
    { id: 'rFrench', studentId: 's1', courseId: 'FRENCH1', priority: 'elective' },
  ],
  terms: [year],
});

describe('createMutualExclusionRule', () => {
  const rule = createMutualExclusionRule('excl1', 'SPANISH1', 'FRENCH1');

  it('allows the first of the pair', () => {
    const partial = freshPartial();
    expect(rule.checkFeasible(ctx, partial, 's1', 'rSpan', spanA).feasible).toBe(true);
  });

  it('rejects the second once the first is assigned', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rSpan', spanA.id);
    const result = rule.checkFeasible(ctx, partial, 's1', 'rFrench', frenchA);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/mutually exclusive/);
  });

  it('generates a single at-most-one constraint across both courses', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', spanA.id);
    vars.varName('s1', frenchA.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.sense).toBe('<=');
    expect(built.constraints[0]?.rhs).toBe(1);
    expect(built.constraints[0]?.terms).toHaveLength(2);
  });
});
