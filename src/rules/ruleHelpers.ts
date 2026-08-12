import type { CourseId, StudentId } from '../types/ids.js';
import type { RuleContext } from '../types/rules.js';
import type { StudentRequest } from '../types/domain.js';

/** The student's request for a given course, if they have one. */
export function requestForCourse(
  ctx: RuleContext,
  studentId: StudentId,
  courseId: CourseId,
): StudentRequest | undefined {
  return ctx.requestsByStudent.get(studentId)?.find((r) => r.courseId === courseId);
}
