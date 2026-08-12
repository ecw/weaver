import type { RequestId } from '../../types/ids.js';
import type { StudentRequest } from '../../types/domain.js';
import type { PartialAssignment, Rule, RuleContext } from '../../types/rules.js';
import type { ScheduleResult, UnresolvedRequest } from '../../types/result.js';
import type { SchedulingInput, SolverStrategy } from '../../types/solver.js';
import { buildRuleContext } from '../buildRuleContext.js';
import { allBuiltinRules, compileRules } from '../../rules/ruleEngine.js';
import { createPartialAssignment, assign } from '../../rules/partialAssignment.js';
import { buildScheduleResult } from '../../reporting/resultBuilder.js';
import { summarizeReasons } from '../../reporting/reasonCodes.js';
import { rankRequests } from './ordering.js';
import { checkAllRules, rankCandidatesByPreference } from './placement.js';
import { tryBoundedBacktrack } from './backtrack.js';

export interface GreedyCoreResult {
  ctx: RuleContext;
  rules: Rule[];
  partial: PartialAssignment;
  unresolvedRequests: UnresolvedRequest[];
  requestsById: Map<RequestId, StudentRequest>;
}

/**
 * The greedy construction pass, factored out so the hybrid solver can reuse
 * it directly (build a partial schedule, then repair the hard cases) without
 * going through ScheduleResult first.
 */
export function runGreedyCore(input: SchedulingInput): GreedyCoreResult {
  const ctx = buildRuleContext(input);
  const rules = [...allBuiltinRules(), ...compileRules(input.rules)];
  const partial = createPartialAssignment();
  const ranked = rankRequests(ctx, input.requests);
  const requestsById = new Map<RequestId, StudentRequest>(input.requests.map((r) => [r.id, r]));
  const unresolvedRequests: UnresolvedRequest[] = [];

  for (const { request, candidates } of ranked) {
    const rankedCandidates = rankCandidatesByPreference(candidates, partial);
    const reasons: string[] = [];
    let placed = false;

    for (const candidate of rankedCandidates) {
      const result = checkAllRules(ctx, partial, rules, request.studentId, request.id, candidate.section);
      if (result.feasible) {
        assign(partial, request.studentId, request.id, candidate.section.id);
        placed = true;
        break;
      }
      if (result.reason) reasons.push(result.reason);
    }

    if (!placed) {
      placed = tryBoundedBacktrack(ctx, partial, rules, request, rankedCandidates, requestsById);
    }

    if (!placed) {
      unresolvedRequests.push({
        requestId: request.id,
        studentId: request.studentId,
        courseId: request.courseId,
        reasons: summarizeReasons(reasons),
      });
    }
  }

  return { ctx, rules, partial, unresolvedRequests, requestsById };
}

export function createGreedySolver(): SolverStrategy {
  return {
    name: 'greedy',
    async solve(input: SchedulingInput): Promise<ScheduleResult> {
      const start = Date.now();
      const { ctx, rules, partial, unresolvedRequests } = runGreedyCore(input);

      return buildScheduleResult({
        solverName: 'greedy',
        ctx,
        input,
        partial,
        unresolvedRequests,
        rules,
        durationMs: Date.now() - start,
      });
    },
  };
}
