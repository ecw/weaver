import type { CourseId } from '../../types/ids.js';
import type { RequestPriority, StudentRequest } from '../../types/domain.js';
import type { RuleContext } from '../../types/rules.js';
import { generateCandidates, type Candidate } from '../../candidates/candidateGenerator.js';

export interface RankedRequest {
  request: StudentRequest;
  candidates: Candidate[];
}

function priorityRank(priority: RequestPriority): number {
  switch (priority) {
    case 'required':
      return 0;
    case 'elective':
      return 1;
    case 'alternate':
      return 2;
  }
}

/**
 * Orders requests most-constrained-first (standard CSP heuristic): required
 * before elective before alternate, then fewer candidate sections, then
 * fewer seats available relative to how many other requests compete for the
 * same course. Ties break on courseId so that requests for the same course
 * -- notably cohort members and other same-course groups -- land next to
 * each other in the queue, which in practice is what makes the greedy loop
 * place them into the same/consistent sections without any special-cased
 * "atomic group" bookkeeping.
 */
export function rankRequests(ctx: RuleContext, requests: StudentRequest[]): RankedRequest[] {
  const requestCountByCourse = new Map<CourseId, number>();
  for (const request of requests) {
    requestCountByCourse.set(request.courseId, (requestCountByCourse.get(request.courseId) ?? 0) + 1);
  }

  const ranked = requests
    .map((request): (RankedRequest & { sortKey: [number, number, number] }) | undefined => {
      const student = ctx.students.get(request.studentId);
      const course = ctx.courses.get(request.courseId);
      if (!student || !course) return undefined;

      const sectionsForCourse = ctx.sectionsByCourse.get(request.courseId) ?? [];
      const candidates = generateCandidates(sectionsForCourse, request, student, course);
      const totalSeats = candidates.reduce((sum, c) => sum + c.section.capacity, 0);
      const competingRequests = requestCountByCourse.get(request.courseId) ?? 1;
      const seatsPerCompetingRequest = totalSeats / competingRequests;

      return {
        request,
        candidates,
        sortKey: [priorityRank(request.priority), candidates.length, seatsPerCompetingRequest],
      };
    })
    .filter((r): r is RankedRequest & { sortKey: [number, number, number] } => r !== undefined);

  ranked.sort((a, b) => {
    for (let i = 0; i < a.sortKey.length; i++) {
      const diff = a.sortKey[i]! - b.sortKey[i]!;
      if (diff !== 0) return diff;
    }
    if (a.request.courseId !== b.request.courseId) {
      return a.request.courseId < b.request.courseId ? -1 : 1;
    }
    return a.request.studentId < b.request.studentId ? -1 : 1;
  });

  return ranked.map(({ request, candidates }) => ({ request, candidates }));
}
