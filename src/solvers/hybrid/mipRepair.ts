import type { SectionId, StudentId } from '../../types/ids.js';
import type { Section } from '../../types/domain.js';
import type { PartialAssignment, Rule, RuleContext } from '../../types/rules.js';
import type { SolveOptions } from '../../types/solver.js';
import { generateCandidates } from '../../candidates/candidateGenerator.js';
import { assign, unassign } from '../../rules/partialAssignment.js';
import { MipModelBuilder } from '../mip/mipModel.js';
import { VariableIndex } from '../mip/variableIndex.js';
import { writeLpFormat } from '../mip/lpFormatWriter.js';
import { solveLp } from '../mip/highsClient.js';
import { parseSolution } from '../mip/resultParser.js';
import { DEFAULT_PREFERENCE_BONUS, defaultWeightFn } from '../mip/objectiveWeights.js';

/**
 * Re-solves only the hard-set students' requests via MIP -- a scoped
 * large-neighborhood-search repair. Every other student's seat is treated as
 * locked: each touched section's capacity is reduced by however many
 * non-hard-set students already occupy it, so the sub-problem never needs
 * variables for (and can never disturb) the rest of the schedule. Mutates
 * `partial` in place, same as the greedy solver's backtracking.
 */
export async function runMipRepair(
  ctx: RuleContext,
  partial: PartialAssignment,
  hardStudentIds: Set<StudentId>,
  rules: Rule[],
  options: SolveOptions = {},
): Promise<void> {
  if (hardStudentIds.size === 0) return;

  const weightFn = options.weightFn ?? defaultWeightFn;
  const preferenceBonus = options.preferenceBonus ?? DEFAULT_PREFERENCE_BONUS;

  const adjustedSections = new Map<SectionId, Section>();
  for (const [id, section] of ctx.sections) {
    const lockedEnrollment = [...(partial.bySection.get(id) ?? [])].filter(
      (studentId) => !hardStudentIds.has(studentId),
    ).length;
    adjustedSections.set(id, { ...section, capacity: Math.max(0, section.capacity - lockedEnrollment) });
  }
  const adjustedSectionsByCourse = new Map<string, Section[]>();
  for (const [courseId, sections] of ctx.sectionsByCourse) {
    adjustedSectionsByCourse.set(
      courseId,
      sections.map((s) => adjustedSections.get(s.id) ?? s),
    );
  }
  const adjustedCtx: RuleContext = { ...ctx, sections: adjustedSections, sectionsByCourse: adjustedSectionsByCourse };

  const model = new MipModelBuilder();
  const vars = new VariableIndex();
  const hardRequests = [...hardStudentIds].flatMap((sid) => ctx.requestsByStudent.get(sid) ?? []);

  for (const request of hardRequests) {
    const student = ctx.students.get(request.studentId);
    const course = ctx.courses.get(request.courseId);
    if (!student || !course) continue;

    const sectionsForCourse = adjustedSectionsByCourse.get(request.courseId) ?? [];
    const candidates = generateCandidates(sectionsForCourse, request, student, course);
    if (candidates.length === 0) continue;

    const terms = candidates.map((candidate) => {
      const varName = vars.varName(request.studentId, candidate.section.id);
      model.addBinaryVar(varName);
      const preferenceMatches =
        (candidate.matchesTeacherPreference ? 1 : 0) + (candidate.matchesTermPreference ? 1 : 0);
      model.addToObjective(varName, weightFn(request.priority) + preferenceMatches * preferenceBonus);
      return { varName, coef: 1 };
    });

    model.addConstraint(terms, '<=', 1, `fulfill_${request.id}`);
  }

  if (vars.allVarNames().length === 0) return;

  for (const rule of rules) {
    rule.addToMipModel(adjustedCtx, model, vars);
  }

  const lpText = writeLpFormat(model.build());
  const solution = await solveLp(lpText, {
    timeLimitSeconds: options.timeLimitSeconds,
    mipRelGap: options.mipRelGap,
  });

  for (const studentId of hardStudentIds) {
    for (const requestId of [...(partial.byStudent.get(studentId)?.keys() ?? [])]) {
      unassign(partial, studentId, requestId);
    }
  }

  const repaired = parseSolution(ctx, solution, vars);
  for (const [studentId, requests] of repaired.byStudent) {
    for (const [requestId, sectionId] of requests) {
      assign(partial, studentId, requestId, sectionId);
    }
  }
}
