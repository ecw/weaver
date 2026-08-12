import { describe, expect, it } from 'vitest';
import { createLinkedSectionsRule } from '../../../src/rules/linkedSections.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const lab = { id: 'BIO-LAB', courseId: 'BIOLAB', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 20 };
const lecture = { id: 'BIO-LEC', courseId: 'BIOLEC', teacherId: 'T1', termId: 'YEAR', periodId: 'P2', capacity: 30 };

const ctx = buildContext({
  sections: [lab, lecture],
  students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
  requests: [
    { id: 'rLab', studentId: 's1', courseId: 'BIOLAB', priority: 'required' },
    { id: 'rLec', studentId: 's1', courseId: 'BIOLEC', priority: 'required' },
  ],
  terms: [year],
});

describe('createLinkedSectionsRule', () => {
  const rule = createLinkedSectionsRule('link1', [[lab.id, lecture.id]]);

  it('allows the first half of the pair when nothing else is assigned yet', () => {
    const partial = freshPartial();
    expect(rule.checkFeasible(ctx, partial, 's1', 'rLab', lab).feasible).toBe(true);
  });

  it('allows the second half when it matches the already-assigned partner', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rLab', lab.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rLec', lecture).feasible).toBe(true);
  });

  it('rejects a request whose partner course was not requested', () => {
    const noPartnerCtx = buildContext({
      sections: [lab, lecture],
      students: [{ id: 's2', name: 'S2', gradeLevel: 10 }],
      requests: [{ id: 'rLab2', studentId: 's2', courseId: 'BIOLAB', priority: 'required' }],
      terms: [year],
    });
    const partial = freshPartial();
    const result = rule.checkFeasible(noPartnerCtx, partial, 's2', 'rLab2', lab);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/did not request/);
  });

  it('is a no-op for a candidate section not part of any pair', () => {
    const other = { id: 'X', courseId: 'X', teacherId: 'T', termId: 'YEAR', periodId: 'P3', capacity: 10 };
    const partial = freshPartial();
    expect(rule.checkFeasible(ctx, partial, 's1', 'rX', other).feasible).toBe(true);
  });

  it('emits an equality constraint when the student has variables for both halves', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', lab.id);
    vars.varName('s1', lecture.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.sense).toBe('=');
    expect(built.constraints[0]?.rhs).toBe(0);
    expect(built.constraints[0]?.terms).toEqual([
      { varName: vars.varName('s1', lab.id), coef: 1 },
      { varName: vars.varName('s1', lecture.id), coef: -1 },
    ]);
  });

  it('forces the lone half to zero when the student only has a variable for one section', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', lab.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]).toMatchObject({ sense: '=', rhs: 0 });
    expect(built.constraints[0]?.terms).toEqual([{ varName: vars.varName('s1', lab.id), coef: 1 }]);
  });
});
