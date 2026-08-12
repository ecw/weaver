import type { RequestId } from '../../types/ids.js';
import type { StudentRequest } from '../../types/domain.js';
import type { UnresolvedRequest, ScheduleResult } from '../../types/result.js';
import type { PartialAssignment } from '../../types/rules.js';
import type { SchedulingInput, SolveOptions, SolverStrategy } from '../../types/solver.js';
import { runGreedyCore } from '../greedy/greedySolver.js';
import { buildScheduleResult } from '../../reporting/resultBuilder.js';
import { summarizeReasons } from '../../reporting/reasonCodes.js';
import { sectionOf } from '../../rules/partialAssignment.js';
import { detectHardCase } from './hardCaseDetector.js';
import { runMipRepair } from './mipRepair.js';
import { runLocalSearchRepair } from './localSearchRepair.js';

const DEFAULT_MAX_REPAIR_ROUNDS = 3;

/**
 * Recomputes the *full* unresolved list against every request, not just the
 * previously-unresolved subset. This matters because MIP repair can reshuffle
 * every request held by a hard-set student -- it can drop a request that was
 * already fulfilled (in favor of a better overall objective value) just as
 * easily as it can fill one in. Checking only the old unresolved list would
 * silently lose track of a newly-dropped request instead of reporting it.
 */
function computeUnresolved(
  requests: StudentRequest[],
  partial: PartialAssignment,
  priorReasons: Map<RequestId, string[]>,
): UnresolvedRequest[] {
  const unresolved: UnresolvedRequest[] = [];
  for (const request of requests) {
    if (sectionOf(partial, request.studentId, request.id) !== undefined) continue;
    unresolved.push({
      requestId: request.id,
      studentId: request.studentId,
      courseId: request.courseId,
      reasons: summarizeReasons(priorReasons.get(request.id) ?? []),
    });
  }
  return unresolved;
}

export function createHybridSolver(): SolverStrategy {
  return {
    name: 'hybrid',
    async solve(input: SchedulingInput, options: SolveOptions = {}): Promise<ScheduleResult> {
      const start = Date.now();
      const { ctx, rules, partial, unresolvedRequests, requestsById } = runGreedyCore(input);

      const priorReasons = new Map<RequestId, string[]>(unresolvedRequests.map((u) => [u.requestId, u.reasons]));
      let unresolved = unresolvedRequests;
      const maxRounds = options.maxRepairRounds ?? DEFAULT_MAX_REPAIR_ROUNDS;

      for (let round = 0; round < maxRounds && unresolved.length > 0; round++) {
        const before = unresolved.length;

        const hardCase = detectHardCase(ctx, partial, unresolved, input.rules);
        await runMipRepair(ctx, partial, hardCase.studentIds, rules, options);
        unresolved = computeUnresolved(input.requests, partial, priorReasons);

        if (unresolved.length > 0) {
          unresolved = runLocalSearchRepair(ctx, partial, rules, requestsById, unresolved);
        }

        if (unresolved.length === before) break; // Neither strategy made progress; further rounds won't help.
      }

      const finalUnresolved: UnresolvedRequest[] = unresolved.map((u) => ({
        ...u,
        reasons: summarizeReasons([...u.reasons, 'Not resolved by greedy construction, MIP repair, or local-search swaps']),
      }));

      return buildScheduleResult({
        solverName: 'hybrid',
        ctx,
        input,
        partial,
        unresolvedRequests: finalUnresolved,
        rules,
        durationMs: Date.now() - start,
      });
    },
  };
}
