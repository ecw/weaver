import type { CourseId, RuleId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { termFullyBefore } from '../terms/termCalendar.js';
import { sectionOf } from './partialAssignment.js';
import { requestForCourse } from './ruleHelpers.js';
import { addPairwiseForbidConstraints } from './pairwiseForbid.js';

/** earlierCourseId must be scheduled in a term fully before laterCourseId's term, for any student taking both. */
export function createSequencingRule(id: RuleId, earlierCourseId: CourseId, laterCourseId: CourseId): Rule {
  return {
    id,
    type: 'sequencing',
    description: `${earlierCourseId} must be taken in a term before ${laterCourseId}`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      if (candidate.courseId === earlierCourseId) {
        const laterRequest = requestForCourse(ctx, studentId, laterCourseId);
        const laterSectionId = laterRequest && sectionOf(partial, studentId, laterRequest.id);
        const laterSection = laterSectionId ? ctx.sections.get(laterSectionId) : undefined;
        if (laterSection) {
          const earlierTerm = ctx.terms.get(candidate.termId);
          const laterTerm = ctx.terms.get(laterSection.termId);
          if (!earlierTerm || !laterTerm || !termFullyBefore(earlierTerm, laterTerm)) {
            return {
              feasible: false,
              reason: `${candidate.id} (${earlierCourseId}) must be scheduled before the student's ${laterSection.id} (${laterCourseId})`,
              conflictingRequestId: laterRequest?.id,
            };
          }
        }
      } else if (candidate.courseId === laterCourseId) {
        const earlierRequest = requestForCourse(ctx, studentId, earlierCourseId);
        const earlierSectionId = earlierRequest && sectionOf(partial, studentId, earlierRequest.id);
        const earlierSection = earlierSectionId ? ctx.sections.get(earlierSectionId) : undefined;
        if (earlierSection) {
          const earlierTerm = ctx.terms.get(earlierSection.termId);
          const laterTerm = ctx.terms.get(candidate.termId);
          if (!earlierTerm || !laterTerm || !termFullyBefore(earlierTerm, laterTerm)) {
            return {
              feasible: false,
              reason: `${candidate.id} (${laterCourseId}) must be scheduled after the student's ${earlierSection.id} (${earlierCourseId})`,
              conflictingRequestId: earlierRequest?.id,
            };
          }
        }
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      addPairwiseForbidConstraints(
        ctx,
        model,
        vars,
        earlierCourseId,
        laterCourseId,
        (secA, secB) => {
          const termA = ctx.terms.get(secA.termId);
          const termB = ctx.terms.get(secB.termId);
          if (!termA || !termB) return false;
          return !termFullyBefore(termA, termB);
        },
      );
    },
  };
}
