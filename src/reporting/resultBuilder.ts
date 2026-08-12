import type { SchedulingInput } from '../types/solver.js';
import type { PartialAssignment, Rule, RuleContext } from '../types/rules.js';
import type {
  FulfilledRequest,
  ScheduleResult,
  SectionUtilization,
  UnresolvedRequest,
} from '../types/result.js';
import { assign, unassign } from '../rules/partialAssignment.js';
import { checkAllRules } from '../solvers/greedy/placement.js';

export interface BuildScheduleResultParams {
  solverName: string;
  ctx: RuleContext;
  input: SchedulingInput;
  partial: PartialAssignment;
  unresolvedRequests: UnresolvedRequest[];
  rules: Rule[];
  durationMs: number;
  solverStatus?: string;
}

/**
 * Re-checks every committed assignment against every active rule, one at a
 * time: temporarily un-assign it, ask "would this still be feasible right
 * now?", then restore it. This is solver-agnostic -- it runs identically
 * whether the assignment came from the greedy, MIP, or hybrid solver -- so
 * "zero hard-constraint violations" is something every ScheduleResult
 * actually proves, not just assumes.
 */
function validateAssignments(
  ctx: RuleContext,
  partial: PartialAssignment,
  rules: Rule[],
): string[] {
  const violations: string[] = [];
  const triples: { studentId: string; requestId: string; sectionId: string }[] = [];
  for (const [studentId, requests] of partial.byStudent) {
    for (const [requestId, sectionId] of requests) {
      triples.push({ studentId, requestId, sectionId });
    }
  }

  for (const { studentId, requestId, sectionId } of triples) {
    const section = ctx.sections.get(sectionId);
    if (!section) {
      violations.push(`${studentId}/${requestId}: assigned to unknown section ${sectionId}`);
      continue;
    }
    unassign(partial, studentId, requestId);
    const result = checkAllRules(ctx, partial, rules, studentId, requestId, section);
    assign(partial, studentId, requestId, sectionId);
    if (!result.feasible) {
      violations.push(`${studentId}/${requestId} -> ${sectionId}: ${result.reason ?? 'rule violation'}`);
    }
  }

  return violations;
}

export function buildScheduleResult(params: BuildScheduleResultParams): ScheduleResult {
  const { solverName, ctx, input, partial, unresolvedRequests, rules, durationMs, solverStatus } = params;

  const assignments = new Map<string, string[]>();
  const fulfilledRequests: FulfilledRequest[] = [];
  for (const [studentId, requests] of partial.byStudent) {
    assignments.set(studentId, [...requests.values()]);
    for (const [requestId, sectionId] of requests) {
      fulfilledRequests.push({ requestId, studentId, sectionId });
    }
  }

  const sectionUtilization: SectionUtilization[] = input.sections.map((section) => {
    const enrolled = partial.bySection.get(section.id)?.size ?? 0;
    return {
      sectionId: section.id,
      capacity: section.capacity,
      enrolled,
      utilizationRate: section.capacity > 0 ? enrolled / section.capacity : 0,
    };
  });

  const totalRequests = input.requests.length;
  const fulfillmentRate = totalRequests > 0 ? fulfilledRequests.length / totalRequests : 1;

  const violations = validateAssignments(ctx, partial, rules);

  return {
    assignments,
    fulfilledRequests,
    unresolvedRequests,
    sectionUtilization,
    fulfillmentRate,
    solverName,
    diagnostics: { durationMs, solverStatus, violations },
  };
}
