import type { Rule } from '../types/rules.js';
import { termsOverlap } from '../terms/termCalendar.js';
import { enrollmentCount } from './partialAssignment.js';

export function createCapacityRule(): Rule {
  return {
    id: 'builtin:capacity',
    type: 'capacity',
    description:
      'Section enrollment must not exceed capacity, respecting any reserved-seat carve-outs.',

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      const enrolled = enrollmentCount(partial, candidate.id);
      if (enrolled >= candidate.capacity) {
        return {
          feasible: false,
          reason: `Section ${candidate.id} is at capacity (${enrolled}/${candidate.capacity})`,
        };
      }

      const student = ctx.students.get(studentId);
      const subgroupIds = student?.subgroupIds ?? [];
      const roster = partial.bySection.get(candidate.id);

      for (const block of candidate.reservedSeats ?? []) {
        if (subgroupIds.includes(block.subgroupId)) continue; // the reservation never restricts the group it protects

        const nonMemberEnrolled = roster
          ? [...roster].filter((sid) => !(ctx.students.get(sid)?.subgroupIds ?? []).includes(block.subgroupId)).length
          : 0;
        const nonMemberCap = candidate.capacity - block.seats;

        if (nonMemberEnrolled >= nonMemberCap) {
          return {
            feasible: false,
            reason: `Section ${candidate.id} has no seats available outside its reserved carve-out (${nonMemberEnrolled}/${nonMemberCap} non-reserved seats)`,
          };
        }
      }

      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      for (const [sectionId, section] of ctx.sections) {
        const studentIds = vars.allStudentIds().filter((sid) => vars.hasVar(sid, sectionId));
        if (studentIds.length === 0) continue;

        model.addConstraint(
          studentIds.map((sid) => ({ varName: vars.varName(sid, sectionId), coef: 1 })),
          '<=',
          section.capacity,
          `cap_${sectionId}`,
        );

        for (const block of section.reservedSeats ?? []) {
          const nonMembers = studentIds.filter((sid) => {
            const student = ctx.students.get(sid);
            return !(student?.subgroupIds ?? []).includes(block.subgroupId);
          });
          if (nonMembers.length === 0) continue;
          model.addConstraint(
            nonMembers.map((sid) => ({ varName: vars.varName(sid, sectionId), coef: 1 })),
            '<=',
            section.capacity - block.seats,
            `cap_${sectionId}_reserve_${block.subgroupId}`,
          );
        }
      }
    },
  };
}

export function createNoDoubleBookingRule(): Rule {
  return {
    id: 'builtin:noDoubleBooking',
    type: 'noDoubleBooking',
    description: 'A student cannot be in two sections that meet the same period in overlapping terms.',

    checkFeasible(ctx, partial, studentId, _requestId, candidate) {
      for (const [requestId, sectionId] of partial.byStudent.get(studentId) ?? []) {
        const assigned = ctx.sections.get(sectionId);
        if (!assigned || assigned.periodId !== candidate.periodId) continue;
        const assignedTerm = ctx.terms.get(assigned.termId);
        const candidateTerm = ctx.terms.get(candidate.termId);
        if (assignedTerm && candidateTerm && termsOverlap(assignedTerm, candidateTerm)) {
          return {
            feasible: false,
            reason: `Conflicts with existing period ${candidate.periodId} assignment (${assigned.courseId}, section ${assigned.id})`,
            conflictingRequestId: requestId,
          };
        }
      }
      return { feasible: true };
    },

    addToMipModel(ctx, model, vars) {
      for (const studentId of vars.allStudentIds()) {
        const sectionIds = vars.sectionsForStudent(studentId);
        for (let a = 0; a < sectionIds.length; a++) {
          for (let b = a + 1; b < sectionIds.length; b++) {
            const secA = ctx.sections.get(sectionIds[a]!);
            const secB = ctx.sections.get(sectionIds[b]!);
            if (!secA || !secB || secA.periodId !== secB.periodId) continue;
            const termA = ctx.terms.get(secA.termId);
            const termB = ctx.terms.get(secB.termId);
            if (!termA || !termB || !termsOverlap(termA, termB)) continue;

            model.addConstraint(
              [
                { varName: vars.varName(studentId, secA.id), coef: 1 },
                { varName: vars.varName(studentId, secB.id), coef: 1 },
              ],
              '<=',
              1,
            );
          }
        }
      }
    },
  };
}

export function createBuiltinRules(): Rule[] {
  return [createCapacityRule(), createNoDoubleBookingRule()];
}
