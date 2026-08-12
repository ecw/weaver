import { describe, expect, it } from 'vitest';
import {
  generateCandidates,
  isGradeEligible,
} from '../../../src/candidates/candidateGenerator.js';
import type { Course, Section, Student, StudentRequest } from '../../../src/types/domain.js';

const course: Course = { id: 'BIO101', name: 'Biology', minGrade: 9, maxGrade: 12 };

const sections: Section[] = [
  { id: 'BIO101-A', courseId: 'BIO101', teacherId: 'T1', termId: 'S1', periodId: 'P1', capacity: 30 },
  { id: 'BIO101-B', courseId: 'BIO101', teacherId: 'T2', termId: 'S1', periodId: 'P2', capacity: 30 },
  { id: 'CHEM201-A', courseId: 'CHEM201', teacherId: 'T3', termId: 'S1', periodId: 'P3', capacity: 30 },
];

function student(gradeLevel: number): Student {
  return { id: 'stu1', name: 'Student One', gradeLevel };
}

function request(overrides: Partial<StudentRequest> = {}): StudentRequest {
  return { id: 'r1', studentId: 'stu1', courseId: 'BIO101', priority: 'required', ...overrides };
}

describe('isGradeEligible', () => {
  it('rejects a student below the minimum grade', () => {
    expect(isGradeEligible(course, student(8))).toBe(false);
  });

  it('rejects a student above the maximum grade', () => {
    expect(isGradeEligible(course, student(13))).toBe(false);
  });

  it('accepts a student within bounds', () => {
    expect(isGradeEligible(course, student(10))).toBe(true);
  });

  it('accepts any grade when no bounds are set', () => {
    expect(isGradeEligible({ id: 'ART', name: 'Art' }, student(1))).toBe(true);
  });
});

describe('generateCandidates', () => {
  it('returns only sections matching the requested course', () => {
    const candidates = generateCandidates(sections, request(), student(10), course);
    expect(candidates.map((c) => c.section.id)).toEqual(['BIO101-A', 'BIO101-B']);
  });

  it('returns nothing for a grade-ineligible student', () => {
    const candidates = generateCandidates(sections, request(), student(6), course);
    expect(candidates).toEqual([]);
  });

  it('flags teacher preference matches without excluding non-matching sections', () => {
    const candidates = generateCandidates(
      sections,
      request({ requestedTeacherId: 'T2' }),
      student(10),
      course,
    );
    expect(candidates).toHaveLength(2);
    const byId = Object.fromEntries(candidates.map((c) => [c.section.id, c]));
    expect(byId['BIO101-A']?.matchesTeacherPreference).toBe(false);
    expect(byId['BIO101-B']?.matchesTeacherPreference).toBe(true);
  });

  it('marks every candidate as matching when no preference was requested', () => {
    const candidates = generateCandidates(sections, request(), student(10), course);
    expect(candidates.every((c) => c.matchesTeacherPreference)).toBe(true);
    expect(candidates.every((c) => c.matchesTermPreference)).toBe(true);
  });
});
