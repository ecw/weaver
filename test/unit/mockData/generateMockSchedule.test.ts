import { describe, expect, it } from 'vitest';
import { generateMockSchedule } from '../../../src/mockData/generateMockSchedule.js';
import type { MockPreset } from '../../../src/mockData/presets.js';

function checkReferentialIntegrity(preset: MockPreset) {
  const input = generateMockSchedule(preset, 42);

  const courseIds = new Set(input.courses.map((c) => c.id));
  const teacherIds = new Set(input.teachers.map((t) => t.id));
  const termIds = new Set(input.terms.map((t) => t.id));
  const periodIds = new Set(input.periods.map((p) => p.id));
  const studentIds = new Set(input.students.map((s) => s.id));
  const sectionIds = new Set(input.sections.map((s) => s.id));

  for (const section of input.sections) {
    expect(courseIds.has(section.courseId), `section ${section.id} references unknown course`).toBe(true);
    expect(teacherIds.has(section.teacherId), `section ${section.id} references unknown teacher`).toBe(true);
    expect(termIds.has(section.termId), `section ${section.id} references unknown term`).toBe(true);
    expect(periodIds.has(section.periodId), `section ${section.id} references unknown period`).toBe(true);
  }

  for (const request of input.requests) {
    expect(studentIds.has(request.studentId), `request ${request.id} references unknown student`).toBe(true);
    expect(courseIds.has(request.courseId), `request ${request.id} references unknown course`).toBe(true);
  }

  for (const def of input.rules) {
    if (def.type === 'linkedSections') {
      for (const [a, b] of def.sectionPairs) {
        expect(sectionIds.has(a)).toBe(true);
        expect(sectionIds.has(b)).toBe(true);
      }
    }
    if (def.type === 'cohort') {
      for (const sid of def.studentIds) expect(studentIds.has(sid)).toBe(true);
      expect(courseIds.has(def.courseId)).toBe(true);
    }
  }

  return input;
}

describe.each<MockPreset>(['small', 'full', 'oversubscribed'])('generateMockSchedule(%s)', (preset) => {
  it('produces internally consistent references (no dangling ids)', () => {
    checkReferentialIntegrity(preset);
  });

  it('produces unique ids for students, sections, courses, and requests', () => {
    const input = generateMockSchedule(preset, 42);
    expect(new Set(input.students.map((s) => s.id)).size).toBe(input.students.length);
    expect(new Set(input.sections.map((s) => s.id)).size).toBe(input.sections.length);
    expect(new Set(input.courses.map((c) => c.id)).size).toBe(input.courses.length);
    expect(new Set(input.requests.map((r) => r.id)).size).toBe(input.requests.length);
  });

  it('is deterministic given the same seed', () => {
    const a = generateMockSchedule(preset, 42);
    const b = generateMockSchedule(preset, 42);
    expect(a.students.map((s) => s.id)).toEqual(b.students.map((s) => s.id));
    expect(a.requests.map((r) => r.id)).toEqual(b.requests.map((r) => r.id));
  });

  it('produces a different population for a different seed', () => {
    const a = generateMockSchedule(preset, 1);
    const b = generateMockSchedule(preset, 2);
    expect(a.requests.map((r) => r.id)).not.toEqual(b.requests.map((r) => r.id));
  });
});

describe('generateMockSchedule rule coverage', () => {
  it("'small' includes every high-school-level rule type (no middle school, so no cohort)", () => {
    const input = generateMockSchedule('small', 42);
    const types = new Set(input.rules.map((r) => r.type));
    expect(types).toEqual(new Set(['linkedSections', 'sequencing', 'sameTeacher', 'mutualExclusion']));
  });

  it.each<MockPreset>(['full', 'oversubscribed'])('%s includes at least one of every rule type', (preset) => {
    const input = generateMockSchedule(preset, 42);
    const types = new Set(input.rules.map((r) => r.type));
    expect(types).toEqual(
      new Set(['linkedSections', 'sequencing', 'sameTeacher', 'mutualExclusion', 'cohort']),
    );
  });

  it("'full' includes a reserved-seat carve-out on the Robotics section", () => {
    const input = generateMockSchedule('full', 42);
    const robotics = input.sections.find((s) => s.id === 'ROBOTICS-A');
    expect(robotics?.reservedSeats).toEqual([{ subgroupId: 'iep', seats: 5 }]);
    expect(input.students.some((s) => s.subgroupIds?.includes('iep'))).toBe(true);
  });

  it("'oversubscribed' includes a deliberately over-requested elective and an unresolvable period conflict", () => {
    const input = generateMockSchedule('oversubscribed', 42);
    const filmSection = input.sections.find((s) => s.id === 'FILM_STUDIES-A');
    const filmRequests = input.requests.filter((r) => r.courseId === 'FILM_STUDIES');
    expect(filmSection).toBeDefined();
    expect(filmRequests.length).toBeGreaterThan(filmSection?.capacity ?? 0);

    const conflictRequests = input.requests.filter((r) => r.courseId === 'CONFLICT_COURSE');
    expect(conflictRequests.length).toBeGreaterThan(0);
    const conflictSection = input.sections.find((s) => s.id === 'CONFLICT_COURSE-A');
    const englishSectionsSamePeriod = input.sections.filter(
      (s) => s.courseId.startsWith('ENGLISH') && s.periodId === conflictSection?.periodId,
    );
    expect(englishSectionsSamePeriod.length).toBeGreaterThan(0);
  });

  it("'full' has more students and requests than 'small'", () => {
    const full = generateMockSchedule('full', 42);
    const small = generateMockSchedule('small', 42);
    expect(full.students.length).toBeGreaterThan(small.students.length);
    expect(full.requests.length).toBeGreaterThan(small.requests.length);
  });
});
