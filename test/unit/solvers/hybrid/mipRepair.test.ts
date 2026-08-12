import { describe, expect, it } from 'vitest';
import { runMipRepair } from '../../../../src/solvers/hybrid/mipRepair.js';
import { createBuiltinRules } from '../../../../src/rules/builtins.js';
import { assign, sectionOf } from '../../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from '../../rules/testFixtures.js';
import type { Term } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const bio = { id: 'BIO-A', courseId: 'BIO', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 2 };

function buildCtx() {
  return buildContext({
    courses: [{ id: 'BIO', name: 'Biology' }],
    sections: [bio],
    students: [
      { id: 'locked', name: 'Locked', gradeLevel: 10 },
      { id: 'hard', name: 'Hard', gradeLevel: 10 },
    ],
    requests: [
      { id: 'rLocked', studentId: 'locked', courseId: 'BIO', priority: 'required' },
      { id: 'rHard', studentId: 'hard', courseId: 'BIO', priority: 'required' },
    ],
    terms: [year],
  });
}

describe('runMipRepair', () => {
  it('places a hard-set student into a seat left over after accounting for locked occupants', async () => {
    const ctx = buildCtx();
    const partial = freshPartial();
    assign(partial, 'locked', 'rLocked', bio.id); // capacity 2, 1 locked seat consumed -> 1 left for the hard set

    await runMipRepair(ctx, partial, new Set(['hard']), createBuiltinRules(), {});

    expect(sectionOf(partial, 'hard', 'rHard')).toBe(bio.id);
    // The locked student's seat must be untouched by the repair.
    expect(sectionOf(partial, 'locked', 'rLocked')).toBe(bio.id);
  }, 20000);

  it('does not overcommit a section whose capacity is already fully consumed by locked students', async () => {
    const ctx = buildCtx();
    const fullBio = { ...bio, capacity: 1 };
    const fullCtx = buildContext({
      courses: [{ id: 'BIO', name: 'Biology' }],
      sections: [fullBio],
      students: [...ctx.students.values()],
      requests: [
        { id: 'rLocked', studentId: 'locked', courseId: 'BIO', priority: 'required' },
        { id: 'rHard', studentId: 'hard', courseId: 'BIO', priority: 'required' },
      ],
      terms: [year],
    });
    const partial = freshPartial();
    assign(partial, 'locked', 'rLocked', fullBio.id); // fills the only seat; locked students are never touched.

    await runMipRepair(fullCtx, partial, new Set(['hard']), createBuiltinRules(), {});

    expect(sectionOf(partial, 'hard', 'rHard')).toBeUndefined();
    expect(sectionOf(partial, 'locked', 'rLocked')).toBe(fullBio.id);
  }, 20000);

  it('is a no-op when the hard set is empty', async () => {
    const ctx = buildCtx();
    const partial = freshPartial();
    assign(partial, 'locked', 'rLocked', bio.id);

    await runMipRepair(ctx, partial, new Set(), createBuiltinRules(), {});

    expect(sectionOf(partial, 'locked', 'rLocked')).toBe(bio.id);
    expect(sectionOf(partial, 'hard', 'rHard')).toBeUndefined();
  });
});
