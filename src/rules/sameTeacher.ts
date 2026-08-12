import type { CourseId, RuleId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { sectionOf } from './partialAssignment.js';
import { requestForCourse } from './ruleHelpers.js';
import { addPairwiseForbidConstraints } from './pairwiseForbid.js';

/** If a student takes both courses, both sections must share the same teacher. */
export function createSameTeacherRule(id: RuleId, courseIdA: CourseId, courseIdB: CourseId): Rule {
  const otherCourseId = (courseId: CourseId): CourseId | undefined => {
    if (courseId === courseIdA) return courseIdB;
    if (courseId === courseIdB) return courseIdA;
    return undefined;
  };

  return {
    id,
    type: 'sameTeacher',
    description: `${courseIdA} and ${courseIdB} must be taken with the same teacher`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      const otherId = otherCourseId(candidate.courseId);
      if (otherId === undefined) return { feasible: true };

      const otherRequest = requestForCourse(ctx, studentId, otherId);
      const otherSectionId = otherRequest && sectionOf(partial, studentId, otherRequest.id);
      const otherSection = otherSectionId ? ctx.sections.get(otherSectionId) : undefined;
      if (otherSection && otherSection.teacherId !== candidate.teacherId) {
        return {
          feasible: false,
          reason: `${candidate.id} (teacher ${candidate.teacherId}) must share a teacher with the student's ${otherSection.id} (teacher ${otherSection.teacherId})`,
          conflictingRequestId: otherRequest?.id,
        };
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      addPairwiseForbidConstraints(
        ctx,
        model,
        vars,
        courseIdA,
        courseIdB,
        (secA, secB) => secA.teacherId !== secB.teacherId,
      );
    },
  };
}
