import type { Course, Section, Student, StudentRequest, Teacher, Term } from '../../../src/types/domain.js';
import type { RuleContext } from '../../../src/types/rules.js';
import { createPartialAssignment } from '../../../src/rules/partialAssignment.js';

/** Shared small fixture used across rule unit tests: two courses, two sections each, one term, one period. */
export function buildContext(overrides: {
  courses?: Course[];
  sections?: Section[];
  students?: Student[];
  requests?: StudentRequest[];
  terms?: Term[];
  teachers?: Teacher[];
}): RuleContext {
  const courses = overrides.courses ?? [];
  const sections = overrides.sections ?? [];
  const students = overrides.students ?? [];
  const requests = overrides.requests ?? [];
  const terms = overrides.terms ?? [];
  const teachers = overrides.teachers ?? [];

  const sectionsByCourse = new Map<string, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) ?? [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  const requestsByStudent = new Map<string, StudentRequest[]>();
  for (const request of requests) {
    const list = requestsByStudent.get(request.studentId) ?? [];
    list.push(request);
    requestsByStudent.set(request.studentId, list);
  }

  return {
    courses: new Map(courses.map((c) => [c.id, c])),
    sections: new Map(sections.map((s) => [s.id, s])),
    sectionsByCourse,
    terms: new Map(terms.map((t) => [t.id, t])),
    students: new Map(students.map((s) => [s.id, s])),
    requestsByStudent,
    teachers: new Map(teachers.map((t) => [t.id, t])),
  };
}

export function freshPartial() {
  return createPartialAssignment();
}
