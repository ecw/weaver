import type { CourseId, RuleId, StudentId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { sectionOf } from './partialAssignment.js';
import { requestForCourse } from './ruleHelpers.js';

/** A fixed group of students (e.g. a middle-school team) must all land in the same section of courseId. */
export function createCohortRule(id: RuleId, studentIds: StudentId[], courseId: CourseId): Rule {
  const members = new Set(studentIds);

  return {
    id,
    type: 'cohort',
    description: `Students [${studentIds.join(', ')}] must share the same section of ${courseId}`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      if (candidate.courseId !== courseId || !members.has(studentId)) return { feasible: true };

      for (const otherId of members) {
        if (otherId === studentId) continue;
        const otherRequest = requestForCourse(ctx, otherId, courseId);
        if (!otherRequest) continue;
        const otherSectionId = sectionOf(partial, otherId, otherRequest.id);
        if (otherSectionId !== undefined && otherSectionId !== candidate.id) {
          return {
            feasible: false,
            reason: `${candidate.id} conflicts with cohort member ${otherId}, already assigned to ${otherSectionId} for ${courseId}`,
          };
        }
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      const leader = studentIds.find((sid) =>
        (ctx.sectionsByCourse.get(courseId) ?? []).some((s) => vars.hasVar(sid, s.id)),
      );
      if (!leader) return;

      const sections = ctx.sectionsByCourse.get(courseId) ?? [];
      for (const section of sections) {
        if (!vars.hasVar(leader, section.id)) continue;
        for (const sid of studentIds) {
          if (sid === leader || !vars.hasVar(sid, section.id)) continue;
          model.addConstraint(
            [
              { varName: vars.varName(sid, section.id), coef: 1 },
              { varName: vars.varName(leader, section.id), coef: -1 },
            ],
            '=',
            0,
          );
        }
      }
    },
  };
}
