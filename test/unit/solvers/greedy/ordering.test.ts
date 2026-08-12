import { describe, expect, it } from 'vitest';
import { rankRequests } from '../../../../src/solvers/greedy/ordering.js';
import { buildContext } from '../../rules/testFixtures.js';
import type { Term } from '../../../../src/types/domain.js';

const year: Term = { id: 'YEAR', name: 'Full Year', type: 'year', parentId: null, startUnit: 1, endUnit: 12 };

describe('rankRequests', () => {
  it('orders required requests before elective before alternate', () => {
    const ctx = buildContext({
      courses: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }],
      sections: [
        { id: 'A1', courseId: 'A', teacherId: 'T', termId: 'YEAR', periodId: 'P1', capacity: 10 },
        { id: 'B1', courseId: 'B', teacherId: 'T', termId: 'YEAR', periodId: 'P2', capacity: 10 },
        { id: 'C1', courseId: 'C', teacherId: 'T', termId: 'YEAR', periodId: 'P3', capacity: 10 },
      ],
      students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
      requests: [
        { id: 'rAlt', studentId: 's1', courseId: 'C', priority: 'alternate' },
        { id: 'rReq', studentId: 's1', courseId: 'A', priority: 'required' },
        { id: 'rElec', studentId: 's1', courseId: 'B', priority: 'elective' },
      ],
      terms: [year],
    });

    const ranked = rankRequests(ctx, [...ctx.requestsByStudent.get('s1')!]);
    expect(ranked.map((r) => r.request.id)).toEqual(['rReq', 'rElec', 'rAlt']);
  });

  it('orders more scarce (fewer candidate sections) requests before less scarce ones at the same priority', () => {
    const ctx = buildContext({
      courses: [{ id: 'SCARCE', name: 'Scarce' }, { id: 'PLENTIFUL', name: 'Plentiful' }],
      sections: [
        { id: 'SCARCE-1', courseId: 'SCARCE', teacherId: 'T', termId: 'YEAR', periodId: 'P1', capacity: 5 },
        { id: 'PLENT-1', courseId: 'PLENTIFUL', teacherId: 'T', termId: 'YEAR', periodId: 'P2', capacity: 30 },
        { id: 'PLENT-2', courseId: 'PLENTIFUL', teacherId: 'T', termId: 'YEAR', periodId: 'P3', capacity: 30 },
        { id: 'PLENT-3', courseId: 'PLENTIFUL', teacherId: 'T', termId: 'YEAR', periodId: 'P4', capacity: 30 },
      ],
      students: [{ id: 's1', name: 'S1', gradeLevel: 10 }],
      requests: [
        { id: 'rPlentiful', studentId: 's1', courseId: 'PLENTIFUL', priority: 'required' },
        { id: 'rScarce', studentId: 's1', courseId: 'SCARCE', priority: 'required' },
      ],
      terms: [year],
    });

    const ranked = rankRequests(ctx, [...ctx.requestsByStudent.get('s1')!]);
    expect(ranked.map((r) => r.request.id)).toEqual(['rScarce', 'rPlentiful']);
  });

  it('groups same-course requests (e.g. a cohort) adjacent to each other', () => {
    const ctx = buildContext({
      courses: [{ id: 'SCI', name: 'Science' }],
      sections: [{ id: 'SCI-A', courseId: 'SCI', teacherId: 'T', termId: 'YEAR', periodId: 'P1', capacity: 30 }],
      students: [
        { id: 's1', name: 'S1', gradeLevel: 6 },
        { id: 's2', name: 'S2', gradeLevel: 6 },
        { id: 's3', name: 'S3', gradeLevel: 6 },
      ],
      requests: [
        { id: 'r1', studentId: 's1', courseId: 'SCI', priority: 'required' },
        { id: 'r2', studentId: 's2', courseId: 'SCI', priority: 'required' },
        { id: 'r3', studentId: 's3', courseId: 'SCI', priority: 'required' },
      ],
      terms: [year],
    });

    const ranked = rankRequests(ctx, [
      ...ctx.requestsByStudent.get('s1')!,
      ...ctx.requestsByStudent.get('s2')!,
      ...ctx.requestsByStudent.get('s3')!,
    ]);
    expect(ranked.every((r) => r.request.courseId === 'SCI')).toBe(true);
  });

  it('skips requests whose student or course is missing from context', () => {
    const ctx = buildContext({
      courses: [],
      sections: [],
      students: [],
      requests: [],
      terms: [year],
    });
    const ranked = rankRequests(ctx, [
      { id: 'orphan', studentId: 'ghost', courseId: 'NOPE', priority: 'required' },
    ]);
    expect(ranked).toEqual([]);
  });
});
