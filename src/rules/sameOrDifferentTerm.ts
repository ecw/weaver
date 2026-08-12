import type { CourseId, RuleId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { termsOverlap } from '../terms/termCalendar.js';
import { sectionOf } from './partialAssignment.js';
import { requestForCourse } from './ruleHelpers.js';
import { addPairwiseForbidConstraints } from './pairwiseForbid.js';

function createTermRelationRule(
  id: RuleId,
  type: 'sameTerm' | 'differentTerm',
  courseIdA: CourseId,
  courseIdB: CourseId,
  requireOverlap: boolean,
): Rule {
  const otherCourseId = (courseId: CourseId): CourseId | undefined => {
    if (courseId === courseIdA) return courseIdB;
    if (courseId === courseIdB) return courseIdA;
    return undefined;
  };

  return {
    id,
    type,
    description: `${courseIdA} and ${courseIdB} must be taken in ${requireOverlap ? 'the same' : 'different'} term(s)`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      const otherId = otherCourseId(candidate.courseId);
      if (otherId === undefined) return { feasible: true };

      const otherRequest = requestForCourse(ctx, studentId, otherId);
      const otherSectionId = otherRequest && sectionOf(partial, studentId, otherRequest.id);
      const otherSection = otherSectionId ? ctx.sections.get(otherSectionId) : undefined;
      if (!otherSection) return { feasible: true };

      const candidateTerm = ctx.terms.get(candidate.termId);
      const otherTerm = ctx.terms.get(otherSection.termId);
      if (!candidateTerm || !otherTerm) return { feasible: true };

      const overlaps = termsOverlap(candidateTerm, otherTerm);
      if (overlaps !== requireOverlap) {
        return {
          feasible: false,
          reason: `${candidate.id} must be in ${requireOverlap ? 'the same' : 'a different'} term as the student's ${otherSection.id}`,
          conflictingRequestId: otherRequest?.id,
        };
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      addPairwiseForbidConstraints(ctx, model, vars, courseIdA, courseIdB, (secA, secB) => {
        const termA = ctx.terms.get(secA.termId);
        const termB = ctx.terms.get(secB.termId);
        if (!termA || !termB) return false;
        return termsOverlap(termA, termB) !== requireOverlap;
      });
    },
  };
}

export function createSameTermRule(id: RuleId, courseIdA: CourseId, courseIdB: CourseId): Rule {
  return createTermRelationRule(id, 'sameTerm', courseIdA, courseIdB, true);
}

export function createDifferentTermRule(id: RuleId, courseIdA: CourseId, courseIdB: CourseId): Rule {
  return createTermRelationRule(id, 'differentTerm', courseIdA, courseIdB, false);
}
