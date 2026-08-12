import type { RequestId } from '../../types/ids.js';
import type { StudentRequest } from '../../types/domain.js';
import type { PartialAssignment, Rule, RuleContext } from '../../types/rules.js';
import type { Candidate } from '../../candidates/candidateGenerator.js';
import { generateCandidates } from '../../candidates/candidateGenerator.js';
import { assign, sectionOf, unassign } from '../../rules/partialAssignment.js';
import { checkAllRules, rankCandidatesByPreference } from './placement.js';

export const DEFAULT_MAX_BACKTRACK_RETRIES = 3;

/**
 * Bounded, conflict-directed backtracking: when `request` can't be placed,
 * look at *why* each candidate failed. If a failure names a conflicting
 * request of the *same* student (see FeasibilityResult.conflictingRequestId
 * -- set by rules like sequencing, same-teacher, linked-sections, and
 * no-double-booking), temporarily free that assignment and see if `request`
 * now fits; if so, try to re-home the bumped request elsewhere before
 * committing. This deliberately does not attempt full CSP-style search --
 * capacity/cohort conflicts (which involve *other* students) are left for
 * the hybrid solver's repair pass, which is a more appropriate place to
 * spend that computation.
 */
export function tryBoundedBacktrack(
  ctx: RuleContext,
  partial: PartialAssignment,
  rules: Rule[],
  request: StudentRequest,
  rankedCandidates: Candidate[],
  requestsById: Map<RequestId, StudentRequest>,
  maxRetries: number = DEFAULT_MAX_BACKTRACK_RETRIES,
): boolean {
  const triedConflicts = new Set<RequestId>();

  for (const candidate of rankedCandidates) {
    if (triedConflicts.size >= maxRetries) break;

    const failure = checkAllRules(ctx, partial, rules, request.studentId, request.id, candidate.section);
    if (failure.feasible || !failure.conflictingRequestId) continue;

    const conflictRequestId = failure.conflictingRequestId;
    if (triedConflicts.has(conflictRequestId)) continue;
    triedConflicts.add(conflictRequestId);

    const bumpedRequest = requestsById.get(conflictRequestId);
    const oldSectionId = sectionOf(partial, request.studentId, conflictRequestId);
    if (!bumpedRequest || oldSectionId === undefined) continue;

    unassign(partial, request.studentId, conflictRequestId);

    const nowFeasible = checkAllRules(ctx, partial, rules, request.studentId, request.id, candidate.section);
    if (!nowFeasible.feasible) {
      assign(partial, request.studentId, conflictRequestId, oldSectionId);
      continue;
    }

    assign(partial, request.studentId, request.id, candidate.section.id);

    const bumpedStudent = ctx.students.get(bumpedRequest.studentId);
    const bumpedCourse = ctx.courses.get(bumpedRequest.courseId);
    const bumpedSections = (ctx.sectionsByCourse.get(bumpedRequest.courseId) ?? []).filter(
      (s) => s.id !== oldSectionId,
    );
    const bumpedCandidates =
      bumpedStudent && bumpedCourse
        ? rankCandidatesByPreference(
            generateCandidates(bumpedSections, bumpedRequest, bumpedStudent, bumpedCourse),
            partial,
          )
        : [];

    const rehomed = bumpedCandidates.some((bumpedCandidate) => {
      const result = checkAllRules(
        ctx,
        partial,
        rules,
        bumpedRequest.studentId,
        bumpedRequest.id,
        bumpedCandidate.section,
      );
      if (!result.feasible) return false;
      assign(partial, bumpedRequest.studentId, bumpedRequest.id, bumpedCandidate.section.id);
      return true;
    });

    if (rehomed) return true;

    // Couldn't re-home the bumped request anywhere else -- roll both changes back and try the next conflict source.
    unassign(partial, request.studentId, request.id);
    assign(partial, request.studentId, conflictRequestId, oldSectionId);
  }

  return false;
}
