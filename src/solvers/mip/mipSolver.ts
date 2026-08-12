import type { ScheduleResult, UnresolvedRequest } from '../../types/result.js';
import type { SchedulingInput, SolveOptions, SolverStrategy } from '../../types/solver.js';
import { buildRuleContext } from '../buildRuleContext.js';
import { allBuiltinRules, compileRules } from '../../rules/ruleEngine.js';
import { generateCandidates } from '../../candidates/candidateGenerator.js';
import { buildScheduleResult } from '../../reporting/resultBuilder.js';
import { summarizeReasons } from '../../reporting/reasonCodes.js';
import { MipModelBuilder } from './mipModel.js';
import { VariableIndex } from './variableIndex.js';
import { writeLpFormat } from './lpFormatWriter.js';
import { solveLp } from './highsClient.js';
import { parseSolution } from './resultParser.js';
import { DEFAULT_PREFERENCE_BONUS, defaultWeightFn } from './objectiveWeights.js';

export function createMipSolver(): SolverStrategy {
  return {
    name: 'mip',
    async solve(input: SchedulingInput, options: SolveOptions = {}): Promise<ScheduleResult> {
      const start = Date.now();
      const ctx = buildRuleContext(input);
      const rules = [...allBuiltinRules(), ...compileRules(input.rules)];
      const weightFn = options.weightFn ?? defaultWeightFn;
      const preferenceBonus = options.preferenceBonus ?? DEFAULT_PREFERENCE_BONUS;

      const model = new MipModelBuilder();
      const vars = new VariableIndex();
      const zeroCandidateRequests: string[] = [];

      for (const request of input.requests) {
        const student = ctx.students.get(request.studentId);
        const course = ctx.courses.get(request.courseId);
        if (!student || !course) {
          zeroCandidateRequests.push(request.id);
          continue;
        }

        const sectionsForCourse = ctx.sectionsByCourse.get(request.courseId) ?? [];
        const candidates = generateCandidates(sectionsForCourse, request, student, course);
        if (candidates.length === 0) {
          zeroCandidateRequests.push(request.id);
          continue;
        }

        const fulfillmentTerms = candidates.map((candidate) => {
          const varName = vars.varName(request.studentId, candidate.section.id);
          model.addBinaryVar(varName);

          const preferenceMatches =
            (candidate.matchesTeacherPreference ? 1 : 0) + (candidate.matchesTermPreference ? 1 : 0);
          const objectiveWeight = weightFn(request.priority) + preferenceMatches * preferenceBonus;
          model.addToObjective(varName, objectiveWeight);

          return { varName, coef: 1 };
        });

        model.addConstraint(fulfillmentTerms, '<=', 1, `fulfill_${request.id}`);
      }

      for (const rule of rules) {
        rule.addToMipModel(ctx, model, vars);
      }

      const builtModel = model.build();
      const lpText = writeLpFormat(builtModel);
      const solution = await solveLp(lpText, {
        timeLimitSeconds: options.timeLimitSeconds,
        mipRelGap: options.mipRelGap,
      });

      const partial = parseSolution(ctx, solution, vars);

      const unresolvedRequests: UnresolvedRequest[] = [];
      for (const request of input.requests) {
        const assignedSection = partial.byStudent.get(request.studentId)?.get(request.id);
        if (assignedSection !== undefined) continue;

        const reasons = zeroCandidateRequests.includes(request.id)
          ? []
          : [
              `The optimizer did not select any of this request's candidate sections given capacity and rule constraints under competing demand (solver status: ${solution.status})`,
            ];
        unresolvedRequests.push({
          requestId: request.id,
          studentId: request.studentId,
          courseId: request.courseId,
          reasons: summarizeReasons(reasons),
        });
      }

      return buildScheduleResult({
        solverName: 'mip',
        ctx,
        input,
        partial,
        unresolvedRequests,
        rules,
        durationMs: Date.now() - start,
        solverStatus: solution.status,
      });
    },
  };
}
