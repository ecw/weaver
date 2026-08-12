import type { RequestId, SectionId, StudentId } from '../../types/ids.js';
import type { StudentRequest } from '../../types/domain.js';
import type { PartialAssignment, Rule, RuleContext } from '../../types/rules.js';
import type { UnresolvedRequest } from '../../types/result.js';
import type { Candidate } from '../../candidates/candidateGenerator.js';
import { generateCandidates } from '../../candidates/candidateGenerator.js';
import { assign, requestIdForSection, unassign } from '../../rules/partialAssignment.js';
import { checkAllRules, rankCandidatesByPreference } from '../greedy/placement.js';

export const DEFAULT_MAX_CHAIN_DEPTH = 3;

/**
 * Tries to place (studentId, requestId) into one of `candidates`, chasing an
 * augmenting-path swap chain when every candidate is full: pick a full
 * section, temporarily evict one of its occupants, and recurse to find that
 * occupant a new home (which may itself require bumping someone else, up to
 * maxDepth hops). If the chain succeeds all the way down, every move is kept;
 * if it dead-ends, every tentative move made along the way is rolled back.
 *
 * `visitedSections` -- not just `visitedStudents` -- is threaded through the
 * whole search: without it, a section vacated earlier in the chain (reserved
 * for an ancestor's placement, but not yet actually assigned since ancestors
 * only commit on the way back up) can look "free" to a student further down
 * the chain and get claimed twice. Reserving it the moment it enters the
 * search prevents that.
 */
function tryPlaceViaChain(
  ctx: RuleContext,
  partial: PartialAssignment,
  rules: Rule[],
  requestsById: Map<RequestId, StudentRequest>,
  studentId: StudentId,
  requestId: RequestId,
  candidates: Candidate[],
  depth: number,
  maxDepth: number,
  visitedStudents: Set<StudentId>,
  visitedSections: Set<SectionId>,
): boolean {
  if (visitedStudents.has(studentId)) return false;
  visitedStudents.add(studentId);

  for (const candidate of candidates) {
    const sectionId = candidate.section.id;
    if (visitedSections.has(sectionId)) continue;

    const direct = checkAllRules(ctx, partial, rules, studentId, requestId, candidate.section);
    if (direct.feasible) {
      assign(partial, studentId, requestId, sectionId);
      return true;
    }

    if (depth >= maxDepth) continue;

    visitedSections.add(sectionId);
    const occupants = [...(partial.bySection.get(sectionId) ?? [])];

    for (const occupantId of occupants) {
      if (visitedStudents.has(occupantId)) continue;
      const occupantRequestId = requestIdForSection(partial, occupantId, sectionId);
      const occupantRequest = occupantRequestId ? requestsById.get(occupantRequestId) : undefined;
      if (!occupantRequestId || !occupantRequest) continue;

      unassign(partial, occupantId, occupantRequestId);

      const nowFeasible = checkAllRules(ctx, partial, rules, studentId, requestId, candidate.section);
      if (nowFeasible.feasible) {
        const occStudent = ctx.students.get(occupantId);
        const occCourse = ctx.courses.get(occupantRequest.courseId);
        const occSections = (ctx.sectionsByCourse.get(occupantRequest.courseId) ?? []).filter(
          (s) => s.id !== sectionId,
        );
        const occCandidates =
          occStudent && occCourse
            ? rankCandidatesByPreference(
                generateCandidates(occSections, occupantRequest, occStudent, occCourse),
                partial,
              )
            : [];

        const rehomed = tryPlaceViaChain(
          ctx,
          partial,
          rules,
          requestsById,
          occupantId,
          occupantRequestId,
          occCandidates,
          depth + 1,
          maxDepth,
          visitedStudents,
          visitedSections,
        );

        if (rehomed) {
          assign(partial, studentId, requestId, sectionId);
          return true;
        }
      }

      // Freeing this occupant's seat didn't lead anywhere -- restore and try the next one.
      assign(partial, occupantId, occupantRequestId, sectionId);
    }

    visitedSections.delete(sectionId);
  }

  return false;
}

/** Attempts each still-unresolved request via tryPlaceViaChain; returns the ones that remain unresolved. */
export function runLocalSearchRepair(
  ctx: RuleContext,
  partial: PartialAssignment,
  rules: Rule[],
  requestsById: Map<RequestId, StudentRequest>,
  unresolvedRequests: UnresolvedRequest[],
  maxDepth: number = DEFAULT_MAX_CHAIN_DEPTH,
): UnresolvedRequest[] {
  const stillUnresolved: UnresolvedRequest[] = [];

  for (const unresolved of unresolvedRequests) {
    const request = requestsById.get(unresolved.requestId);
    const student = request && ctx.students.get(request.studentId);
    const course = request && ctx.courses.get(request.courseId);
    if (!request || !student || !course) {
      stillUnresolved.push(unresolved);
      continue;
    }

    const sectionsForCourse = ctx.sectionsByCourse.get(request.courseId) ?? [];
    const candidates = rankCandidatesByPreference(
      generateCandidates(sectionsForCourse, request, student, course),
      partial,
    );

    const resolved = tryPlaceViaChain(
      ctx,
      partial,
      rules,
      requestsById,
      request.studentId,
      request.id,
      candidates,
      0,
      maxDepth,
      new Set(),
      new Set(),
    );

    if (!resolved) stillUnresolved.push(unresolved);
  }

  return stillUnresolved;
}
