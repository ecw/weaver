import { describe, expect, it } from 'vitest';
import { createSequencingRule } from '../../../src/rules/sequencing.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const s1: Term = { id: 'S1', name: 'Semester 1', type: 'semester', parentId: null, startUnit: 1, endUnit: 6 };
const s2: Term = { id: 'S2', name: 'Semester 2', type: 'semester', parentId: null, startUnit: 7, endUnit: 12 };

const introS1 = { id: 'INTRO-A', courseId: 'INTRO', teacherId: 'T1', termId: 'S1', periodId: 'P1', capacity: 20 };
const apS2 = { id: 'AP-A', courseId: 'AP', teacherId: 'T2', termId: 'S2', periodId: 'P1', capacity: 20 };
const apS1 = { id: 'AP-EARLY', courseId: 'AP', teacherId: 'T2', termId: 'S1', periodId: 'P2', capacity: 20 };

const ctx = buildContext({
  sections: [introS1, apS2, apS1],
  students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
  requests: [
    { id: 'rIntro', studentId: 's1', courseId: 'INTRO', priority: 'required' },
    { id: 'rAp', studentId: 's1', courseId: 'AP', priority: 'required' },
  ],
  terms: [s1, s2],
});

describe('createSequencingRule', () => {
  const rule = createSequencingRule('seq1', 'INTRO', 'AP');

  it('allows placing the later course after the earlier one is already scheduled correctly', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rIntro', introS1.id);
    expect(rule.checkFeasible(ctx, partial, 's1', 'rAp', apS2).feasible).toBe(true);
  });

  it('rejects the later course if it would not be strictly after the earlier one', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rIntro', introS1.id);
    const result = rule.checkFeasible(ctx, partial, 's1', 'rAp', apS1);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/must be scheduled after/);
  });

  it('rejects the earlier course if the later one is already locked in too early', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'rAp', apS1.id);
    const result = rule.checkFeasible(ctx, partial, 's1', 'rIntro', introS1);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/must be scheduled before/);
  });

  it('is permissive when the other course has not been assigned yet', () => {
    const partial = freshPartial();
    expect(rule.checkFeasible(ctx, partial, 's1', 'rIntro', introS1).feasible).toBe(true);
  });

  it('forbids the (introS1, apS1) pair but not (introS1, apS2) in the MIP model', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', introS1.id);
    vars.varName('s1', apS2.id);
    vars.varName('s1', apS1.id);
    rule.addToMipModel(ctx, model, vars);
    const built = model.build();
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.terms.map((t) => t.varName).sort()).toEqual(
      [vars.varName('s1', introS1.id), vars.varName('s1', apS1.id)].sort(),
    );
  });
});
