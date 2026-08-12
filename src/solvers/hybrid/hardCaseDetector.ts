import type { StudentId } from '../../types/ids.js';
import type { RuleDefinition, RuleContext } from '../../types/rules.js';
import type { UnresolvedRequest } from '../../types/result.js';
import type { PartialAssignment } from '../../types/rules.js';
import { isGradeEligible } from '../../candidates/candidateGenerator.js';

export interface HardCase {
  /** Every student worth reconsidering in the repair sub-problem: the unresolved requesters plus anyone currently holding a seat they might need. */
  studentIds: Set<StudentId>;
}

/**
 * Builds a small "hard set" of students for the repair solvers to focus on,
 * instead of re-optimizing the whole district: each unresolved request's own
 * student, plus every student currently occupying a seat in one of that
 * request's candidate sections (a "displacement candidate" -- someone who
 * could potentially move elsewhere to free up room). Cohort rules are then
 * closed over: if any cohort member lands in the hard set, every member
 * joins it too, since they must always move as a group.
 */
export function detectHardCase(
  ctx: RuleContext,
  partial: PartialAssignment,
  unresolvedRequests: UnresolvedRequest[],
  ruleDefinitions: RuleDefinition[],
): HardCase {
  const studentIds = new Set<StudentId>();

  for (const unresolved of unresolvedRequests) {
    studentIds.add(unresolved.studentId);

    const student = ctx.students.get(unresolved.studentId);
    const course = ctx.courses.get(unresolved.courseId);
    if (!student || !course || !isGradeEligible(course, student)) continue;

    for (const section of ctx.sectionsByCourse.get(unresolved.courseId) ?? []) {
      for (const occupantId of partial.bySection.get(section.id) ?? []) {
        studentIds.add(occupantId);
      }
    }
  }

  for (const def of ruleDefinitions) {
    if (def.type !== 'cohort') continue;
    if (def.studentIds.some((id) => studentIds.has(id))) {
      for (const id of def.studentIds) studentIds.add(id);
    }
  }

  return { studentIds };
}
