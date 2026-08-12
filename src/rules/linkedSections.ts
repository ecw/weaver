import type { SectionId } from '../types/ids.js';
import type { Rule } from '../types/rules.js';
import { sectionOf } from './partialAssignment.js';
import { requestForCourse } from './ruleHelpers.js';

/**
 * Two specific sections (e.g. a lab + its lecture, or a two-period block
 * elective) that a student must be co-enrolled in: assigned to one implies
 * assigned to the other, never just one.
 */
export function createLinkedSectionsRule(id: string, sectionPairs: [SectionId, SectionId][]): Rule {
  function partnerOf(sectionId: SectionId): SectionId | undefined {
    for (const [a, b] of sectionPairs) {
      if (sectionId === a) return b;
      if (sectionId === b) return a;
    }
    return undefined;
  }

  return {
    id,
    type: 'linkedSections',
    description: `Sections must be co-assigned in pairs: ${sectionPairs.map(([a, b]) => `${a}<->${b}`).join(', ')}`,

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      const partnerId = partnerOf(candidate.id);
      if (partnerId === undefined) return { feasible: true };

      const partnerSection = ctx.sections.get(partnerId);
      if (!partnerSection) return { feasible: true };

      const partnerRequest = requestForCourse(ctx, studentId, partnerSection.courseId);
      if (!partnerRequest) {
        return {
          feasible: false,
          reason: `Section ${candidate.id} is linked to ${partnerId} (${partnerSection.courseId}), which the student did not request`,
        };
      }

      const assignedPartner = sectionOf(partial, studentId, partnerRequest.id);
      if (assignedPartner !== undefined && assignedPartner !== partnerId) {
        return {
          feasible: false,
          reason: `Section ${candidate.id} is linked to ${partnerId}, but the student is already assigned to ${assignedPartner} for ${partnerSection.courseId}`,
          conflictingRequestId: partnerRequest.id,
        };
      }
      return { feasible: true };
    },

    addToMipModel(_ctx, model, vars) {
      for (const [aId, bId] of sectionPairs) {
        const studentsWithA = vars.allStudentIds().filter((sid) => vars.hasVar(sid, aId));
        const studentsWithB = vars.allStudentIds().filter((sid) => vars.hasVar(sid, bId));
        const allStudents = new Set([...studentsWithA, ...studentsWithB]);

        for (const sid of allStudents) {
          const hasA = vars.hasVar(sid, aId);
          const hasB = vars.hasVar(sid, bId);
          if (hasA && hasB) {
            model.addConstraint(
              [
                { varName: vars.varName(sid, aId), coef: 1 },
                { varName: vars.varName(sid, bId), coef: -1 },
              ],
              '=',
              0,
            );
          } else if (hasA) {
            // Can't take A without B, and B isn't a candidate for this student at all.
            model.addConstraint([{ varName: vars.varName(sid, aId), coef: 1 }], '=', 0);
          } else {
            model.addConstraint([{ varName: vars.varName(sid, bId), coef: 1 }], '=', 0);
          }
        }
      }
    },
  };
}
