import type { RuleContext } from '../../types/rules.js';
import type { PartialAssignment } from '../../types/rules.js';
import { assign, createPartialAssignment } from '../../rules/partialAssignment.js';
import { requestForCourse } from '../../rules/ruleHelpers.js';
import type { VariableIndex } from './variableIndex.js';
import type { HighsSolveResult } from './highsClient.js';

/**
 * Turns HiGHS's { varName -> { Primal } } solution back into a PartialAssignment.
 * MIP variables are indexed by (student, section) -- not (student, request) --
 * so the request id is recovered by looking up the student's request for the
 * assigned section's course (candidate generation guarantees at most one
 * request per student per course).
 */
export function parseSolution(
  ctx: RuleContext,
  solution: HighsSolveResult,
  vars: VariableIndex,
): PartialAssignment {
  const partial = createPartialAssignment();

  for (const varName of vars.allVarNames()) {
    const primal = solution.columns[varName]?.Primal ?? 0;
    if (primal <= 0.5) continue;

    const pair = vars.pairFor(varName);
    if (!pair) continue;

    const section = ctx.sections.get(pair.sectionId);
    if (!section) continue;

    const request = requestForCourse(ctx, pair.studentId, section.courseId);
    if (!request) continue;

    assign(partial, pair.studentId, request.id, pair.sectionId);
  }

  return partial;
}
