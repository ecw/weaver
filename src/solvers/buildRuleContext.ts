import type { SchedulingInput } from '../types/solver.js';
import type { RuleContext } from '../types/rules.js';

/** Builds the shared lookup context every solver and rule reads from a SchedulingInput. */
export function buildRuleContext(input: SchedulingInput): RuleContext {
  const sectionsByCourse = new Map<string, typeof input.sections>();
  for (const section of input.sections) {
    const list = sectionsByCourse.get(section.courseId) ?? [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  const requestsByStudent = new Map<string, typeof input.requests>();
  for (const request of input.requests) {
    const list = requestsByStudent.get(request.studentId) ?? [];
    list.push(request);
    requestsByStudent.set(request.studentId, list);
  }

  return {
    courses: new Map(input.courses.map((c) => [c.id, c])),
    sections: new Map(input.sections.map((s) => [s.id, s])),
    sectionsByCourse,
    terms: new Map(input.terms.map((t) => [t.id, t])),
    students: new Map(input.students.map((s) => [s.id, s])),
    requestsByStudent,
    teachers: new Map(input.teachers.map((t) => [t.id, t])),
  };
}
