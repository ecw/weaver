import type { Rule } from '../types/rules.js';
import { isGradeEligible } from '../candidates/candidateGenerator.js';

/**
 * A student may only be assigned to a section whose course grade range
 * includes their grade level. Candidate generation already prevents this
 * structurally (ineligible sections never become candidates), so this rule
 * exists mainly as a belt-and-suspenders check reused by the post-hoc
 * validation pass in reporting/resultBuilder.ts, which re-validates every
 * solver's output the same way regardless of how the assignment was produced.
 */
export function createGradeEligibilityRule(): Rule {
  return {
    id: 'builtin:gradeEligibility',
    type: 'gradeEligibility',
    description: "A student's grade level must fall within their assigned course's grade range.",

    checkFeasible(ctx, _partial, studentId, _requestId, candidate) {
      const course = ctx.courses.get(candidate.courseId);
      const student = ctx.students.get(studentId);
      if (course && student && !isGradeEligible(course, student)) {
        return {
          feasible: false,
          reason: `Student grade ${student.gradeLevel} is outside ${course.id}'s eligible range`,
        };
      }
      return { feasible: true };
    },

    addToMipModel() {
      // No-op: enforced structurally by never creating a variable for an ineligible (student, section) pair.
    },
  };
}
