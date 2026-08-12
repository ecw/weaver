import type { CourseId, RuleId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { requestForCourse } from './ruleHelpers.js';
import { sectionOf } from './partialAssignment.js';

/** A student may not be enrolled in both courseIdA and courseIdB. */
export function createMutualExclusionRule(id: RuleId, courseIdA: CourseId, courseIdB: CourseId): Rule {
  const otherCourseId = (courseId: CourseId): CourseId | undefined => {
    if (courseId === courseIdA) return courseIdB;
    if (courseId === courseIdB) return courseIdA;
    return undefined;
  };

  return {
    id,
    type: 'mutualExclusion',
    description: `A student may take at most one of ${courseIdA} / ${courseIdB}`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      const otherId = otherCourseId(candidate.courseId);
      if (otherId === undefined) return { feasible: true };

      const otherRequest = requestForCourse(ctx, studentId, otherId);
      const otherSectionId = otherRequest && sectionOf(partial, studentId, otherRequest.id);
      if (otherSectionId !== undefined) {
        return {
          feasible: false,
          reason: `${candidate.courseId} is mutually exclusive with ${otherId}, which the student is already assigned to`,
        };
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      const sectionsA = ctx.sectionsByCourse.get(courseIdA) ?? [];
      const sectionsB = ctx.sectionsByCourse.get(courseIdB) ?? [];

      for (const studentId of vars.allStudentIds()) {
        const terms = [
          ...sectionsA.filter((s) => vars.hasVar(studentId, s.id)),
          ...sectionsB.filter((s) => vars.hasVar(studentId, s.id)),
        ].map((s) => ({ varName: vars.varName(studentId, s.id), coef: 1 }));

        if (terms.length > 0) {
          model.addConstraint(terms, '<=', 1);
        }
      }
    },
  };
}
