import type { RequestId, StudentId } from '../../types/ids.js';
import type { Section } from '../../types/domain.js';
import type { FeasibilityResult, PartialAssignment, Rule, RuleContext } from '../../types/rules.js';
import type { Candidate } from '../../candidates/candidateGenerator.js';
import { enrollmentCount } from '../../rules/partialAssignment.js';

/** Runs every rule's checkFeasible in order, short-circuiting on the first rejection. */
export function checkAllRules(
  ctx: RuleContext,
  partial: PartialAssignment,
  rules: Rule[],
  studentId: StudentId,
  requestId: RequestId,
  candidate: Section,
): FeasibilityResult {
  for (const rule of rules) {
    const result = rule.checkFeasible(ctx, partial, studentId, requestId, candidate);
    if (!result.feasible) return result;
  }
  return { feasible: true };
}

/** Prefer sections matching the student's stated teacher/term preference, then prefer less-full sections. */
export function rankCandidatesByPreference(
  candidates: Candidate[],
  partial: PartialAssignment,
): Candidate[] {
  return [...candidates].sort((a, b) => {
    const missA = (a.matchesTeacherPreference ? 0 : 1) + (a.matchesTermPreference ? 0 : 1);
    const missB = (b.matchesTeacherPreference ? 0 : 1) + (b.matchesTermPreference ? 0 : 1);
    if (missA !== missB) return missA - missB;

    const fillA = enrollmentCount(partial, a.section.id) / a.section.capacity;
    const fillB = enrollmentCount(partial, b.section.id) / b.section.capacity;
    if (fillA !== fillB) return fillA - fillB;

    return a.section.id < b.section.id ? -1 : 1;
  });
}
