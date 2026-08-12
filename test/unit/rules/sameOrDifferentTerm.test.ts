import { describe, expect, it } from 'vitest';
import { createDifferentTermRule, createSameTermRule } from '../../../src/rules/sameOrDifferentTerm.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const s1: Term = { id: 'S1', name: 'Semester 1', type: 'semester', parentId: null, startUnit: 1, endUnit: 6 };
const s2: Term = { id: 'S2', name: 'Semester 2', type: 'semester', parentId: null, startUnit: 7, endUnit: 12 };

const spanS1 = { id: 'SPAN-S1', courseId: 'SPANISH', teacherId: 'T1', termId: 'S1', periodId: 'P1', capacity: 20 };
const frenchS1 = { id: 'FR-S1', courseId: 'FRENCH', teacherId: 'T2', termId: 'S1', periodId: 'P2', capacity: 20 };
const frenchS2 = { id: 'FR-S2', courseId: 'FRENCH', teacherId: 'T2', termId: 'S2', periodId: 'P2', capacity: 20 };

const ctx = buildContext({
  sections: [spanS1, frenchS1, frenchS2],
  students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
  requests: [
    { id: 'rSpan', studentId: 's1', courseId: 'SPANISH', priority: 'elective' },
    { id: 'rFrench', studentId: 's1', courseId: 'FRENCH', priority: 'elective' },
  ],
  terms: [s1, s2],
});

describe('createDifferentTermRule', () => {
  const rule = createDifferentTermRule('diff1', 'SPANISH', 'FRENCH');

  it('rejects an overlapping-term pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rSpan', spanS1.id);
    const result = rule.checkFeasible(ctx, partial, 's1', 'rFrench', frenchS1);
    expect(result.feasible).toBe(false);
  });

  it('allows a non-overlapping-term pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rSpan', spanS1.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rFrench', frenchS2).feasible).toBe(true);
  });

  it('forbids only the overlapping pair in the MIP model', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', spanS1.id);
    vars.varName('s1', frenchS1.id);
    vars.varName('s1', frenchS2.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.terms.map((t) => t.varName).sort()).toEqual(
      [vars.varName('s1', spanS1.id), vars.varName('s1', frenchS1.id)].sort(),
    );
  });
});

describe('createSameTermRule', () => {
  const rule = createSameTermRule('same1', 'SPANISH', 'FRENCH');

  it('allows an overlapping-term pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rSpan', spanS1.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rFrench', frenchS1).feasible).toBe(true);
  });

  it('rejects a non-overlapping-term pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rSpan', spanS1.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rFrench', frenchS2).feasible).toBe(false);
  });
});
