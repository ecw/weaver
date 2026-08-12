import { describe, expect, it } from 'vitest';
import { detectHardCase } from '../../../../src/solvers/hybrid/hardCaseDetector.js';
import { assign } from '../../../../src/rules/partialAssignment.js';
import { buildContext, freshPartial } from '../../rules/testFixtures.js';
import type { Term } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };
const bio = { id: 'BIO-A', courseId: 'BIO', teacherId: 'T1', termId: 'YEAR', periodId: 'P1', capacity: 2 };

const ctx = buildContext({
  courses: [{ id: 'BIO', name: 'Biology' }],
  sections: [bio],
  students: [
    { id: 'occupant1', name: 'O1', gradeLevel: 10 },
    { id: 'occupant2', name: 'O2', gradeLevel: 10 },
    { id: 'unresolved', name: 'U', gradeLevel: 10 },
    { id: 'unrelated', name: 'Unrelated', gradeLevel: 10 },
  ],
  requests: [
    { id: 'rO1', studentId: 'occupant1', courseId: 'BIO', priority: 'required' },
    { id: 'rO2', studentId: 'occupant2', courseId: 'BIO', priority: 'required' },
    { id: 'rU', studentId: 'unresolved', courseId: 'BIO', priority: 'required' },
  ],
  terms: [year],
});

describe('detectHardCase', () => {
  it('includes the unresolved student and the current occupants of its candidate sections', () => {
    const partial = freshPartial();
    assign(partial, 'occupant1', 'rO1', bio.id);
    assign(partial, 'occupant2', 'rO2', bio.id);

    const hardCase = detectHardCase(
      ctx,
      partial,
      [{ requestId: 'rU', studentId: 'unresolved', courseId: 'BIO', reasons: ['at capacity'] }],
      [],
    );

    expect(hardCase.studentIds).toEqual(new Set(['unresolved', 'occupant1', 'occupant2']));
    expect(hardCase.studentIds.has('unrelated')).toBe(false);
  });

  it('expands the hard set to every member of a cohort once one member is included', () => {
    const partial = freshPartial();
    const hardCase = detectHardCase(
      ctx,
      partial,
      [{ requestId: 'rU', studentId: 'unresolved', courseId: 'BIO', reasons: ['no room'] }],
      [{ type: 'cohort', id: 'team1', studentIds: ['unresolved', 'unrelated', 'occupant1'], courseId: 'BIO' }],
    );

    expect(hardCase.studentIds.has('unrelated')).toBe(true);
    expect(hardCase.studentIds.has('occupant1')).toBe(true);
  });

  it('does not expand cohorts that share no member with the hard set', () => {
    const partial = freshPartial();
    const hardCase = detectHardCase(
      ctx,
      partial,
      [{ requestId: 'rU', studentId: 'unresolved', courseId: 'BIO', reasons: ['no room'] }],
      [{ type: 'cohort', id: 'team2', studentIds: ['occupant1', 'occupant2'], courseId: 'BIO' }],
    );

    // occupant1/occupant2 aren't dragged in unless they're already an occupant of a candidate section.
    expect(hardCase.studentIds).toEqual(new Set(['unresolved']));
  });
});
