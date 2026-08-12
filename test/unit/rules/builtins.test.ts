import { describe, expect, it } from 'vitest';
import { createCapacityRule, createNoDoubleBookingRule } from '../../../src/rules/builtins.js';
import { MipModelBuilder } from '../../../src/solvers/mip/mipModel.js';
import { VariableIndex } from '../../../src/solvers/mip/variableIndex.js';
import { assign } from '../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from './testFixtures.js';
import type { Term } from '../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };

describe('createCapacityRule', () => {
  const section = {
    id: 'BIO101-A',
    courseId: 'BIO101',
    teacherId: 'T1',
    termId: 'YEAR',
    periodId: 'P1',
    capacity: 2,
  };
  const ctx = buildContext({
    sections: [section],
    students: [
      { id: 's1', name: 'S1', gradeLevel: 10 },
      { id: 's2', name: 'S2', gradeLevel: 10 },
      { id: 's3', name: 'S3', gradeLevel: 10, subgroupIds: ['iep'] },
    ],
    terms: [year],
  });

  it('allows assignment while under capacity', () => {
    const partial = freshPartial();
    const result = createCapacityRule().checkFeasible(ctx, partial, 's1', 'r1', section);
    expect(result.feasible).toBe(true);
  });

  it('rejects assignment once capacity is reached', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'r1', section.id);
    assign(partial, 's2', 'r2', section.id);
    const result = createCapacityRule().checkFeasible(ctx, partial, 's3', 'r3', section);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/at capacity/);
  });

  it('respects reserved-seat carve-outs against non-member students', () => {
    const reservedSection = {
      ...section,
      id: 'ROBOTICS-A',
      capacity: 3,
      reservedSeats: [{ subgroupId: 'iep', seats: 1 }],
    };
    const rctx = buildContext({
      sections: [reservedSection],
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's2', name: 'S2', gradeLevel: 10 },
        { id: 's4', name: 'S4', gradeLevel: 10 },
        { id: 's3', name: 'S3', gradeLevel: 10, subgroupIds: ['iep'] },
      ],
      terms: [year],
    });
    const partial = freshPartial();
    // Fill the 2 non-reserved seats (capacity 3 - 1 reserved) with non-subgroup students.
    assign(partial, 's1', 'r1', reservedSection.id);
    assign(partial, 's2', 'r2', reservedSection.id);

    const blockedNonMember = createCapacityRule().checkFeasible(rctx, partial, 's4', 'r4', reservedSection);
    expect(blockedNonMember.feasible).toBe(false);
    expect(blockedNonMember.reason).toMatch(/reserved carve-out/);

    const allowedMember = createCapacityRule().checkFeasible(rctx, partial, 's3', 'r3', reservedSection);
    expect(allowedMember.feasible).toBe(true);
  });

  it('generates a capacity constraint and a reserved-seat constraint in the MIP model', () => {
    const reservedSection = { ...section, id: 'ROBOTICS-A', capacity: 3, reservedSeats: [{ subgroupId: 'iep', seats: 1 }] };
    const rctx = buildContext({
      sections: [reservedSection],
      students: [
        { id: 's1', name: 'S1', gradeLevel: 10 },
        { id: 's3', name: 'S3', gradeLevel: 10, subgroupIds: ['iep'] },
      ],
      terms: [year],
    });
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', reservedSection.id);
    vars.varName('s3', reservedSection.id);

    createCapacityRule().addToMipModel(rctx, model, vars);
    const built = model.build();
    const capConstraint = built.constraints.find((c) => c.name === `cap_${reservedSection.id}`);
    expect(capConstraint).toBeDefined();
    expect(capConstraint?.sense).toBe('<=');
    expect(capConstraint?.rhs).toBe(3);
    expect(capConstraint?.terms).toHaveLength(2);

    const reserveConstraint = built.constraints.find((c) => c.name === `cap_${reservedSection.id}_reserve_iep`);
    expect(reserveConstraint).toBeDefined();
    expect(reserveConstraint?.rhs).toBe(2); // capacity 3 - 1 reserved
    expect(reserveConstraint?.terms).toHaveLength(1); // only the non-member student
  });
});

describe('createNoDoubleBookingRule', () => {
  const secA = { id: 'A', courseId: 'BIO101', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 30 };
  const secB = { id: 'B', courseId: 'CHEM201', teacherId: 'T2', termId: 'YEAR', periodId: 'P1', capacity: 30 };
  const secC = { id: 'C', courseId: 'MATH101', teacherId: 'T3', termId: 'YEAR', periodId: 'P2', capacity: 30 };
  const ctx = buildContext({
    sections: [secA, secB, secC],
    students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
    terms: [year],
  });

  it('allows two sections in different periods', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'r1', secA.id);
    const result = createNoDoubleBookingRule().checkFeasible(ctx, partial, 's1', 'r2', secC);
    expect(result.feasible).toBe(true);
  });

  it('rejects two sections in the same period with overlapping terms', () => {
    const partial = freshPartial();
    assign(partial, 's1', 'r1', secA.id);
    const result = createNoDoubleBookingRule().checkFeasible(ctx, partial, 's1', 'r2', secB);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/Conflicts with existing period/);
  });

  it('generates a forbidden-pair constraint for same-period overlapping-term sections', () => {
    const model = new MipModelBuilder();
    const vars = new VariableIndex();
    vars.varName('s1', secA.id);
    vars.varName('s1', secB.id);
    vars.varName('s1', secC.id);

    createNoDoubleBookingRule().addToMipModel(ctx, model, vars);
    const built = model.build();
    // Only A/B conflict (same period, overlapping term); A/C and B/C do not (different period).
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]?.sense).toBe('<=');
    expect(built.constraints[0]?.rhs).toBe(1);
    expect(built.constraints[0]?.terms.map((t) => t.varName).sort()).toEqual(
      [vars.varName('s1', secA.id), vars.varName('s1', secB.id)].sort(),
    );
  });
});
