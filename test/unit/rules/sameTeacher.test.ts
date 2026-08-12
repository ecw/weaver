import { describe, expect, it } from 'vitest';
import { createSameTeacherRule } from '../../../src/rules/sameTeacher.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const bandT1 = { id: 'BAND-A', courseId: 'BAND', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 40 };
const jazzT1 = { id: 'JAZZ-A', courseId: 'JAZZ', teacherId: 'T1', termId: 'YEAR', periodId: 'P2', capacity: 20 };
const jazzT2 = { id: 'JAZZ-B', courseId: 'JAZZ', teacherId: 'T2', termId: 'YEAR', periodId: 'P3', capacity: 20 };

const ctx = buildContext({
  sections: [bandT1, jazzT1, jazzT2],
  students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
  requests: [
    { id: 'rBand', studentId: 's1', courseId: 'BAND', priority: 'elective' },
    { id: 'rJazz', studentId: 's1', courseId: 'JAZZ', priority: 'elective' },
  ],
  terms: [year],
});

describe('createSameTeacherRule', () => {
  const rule = createSameTeacherRule('teach1', 'BAND', 'JAZZ');

  it('allows a matching-teacher pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rBand', bandT1.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rJazz', jazzT1).feasible).toBe(true);
  });

  it('rejects a mismatched-teacher pair', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rBand', bandT1.id);
    const result = rule.checkFeasible(ctx, partial, 's1', 'rJazz', jazzT2);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/must share a teacher/);
  });

  it('generates forbidden-pair constraints only for mismatched-teacher combinations', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', bandT1.id);
    vars.varName('s1', jazzT1.id);
    vars.varName('s1', jazzT2.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.terms.map((t) => t.varName).sort()).toEqual(
      [vars.varName('s1', bandT1.id), vars.varName('s1', jazzT2.id)].sort(),
    );
  });
});
