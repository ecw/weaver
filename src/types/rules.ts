import type { CourseId, RequestId, RuleId, SectionId, StudentId } from './ids.js';
import type { Course, Section, Student, StudentRequest, Teacher, Term } from './domain.js';
import type { MipModelBuilder } from '../solvers/mip/mipModel.js';
import type { VariableIndex } from '../solvers/mip/variableIndex.js';

export type RuleDefinition =
  | { type: 'linkedSections'; id: RuleId; sectionPairs: [SectionId, SectionId][] }
  | { type: 'sequencing'; id: RuleId; earlierCourseId: CourseId; laterCourseId: CourseId }
  | { type: 'sameTeacher'; id: RuleId; courseIdA: CourseId; courseIdB: CourseId }
  | { type: 'sameTerm'; id: RuleId; courseIdA: CourseId; courseIdB: CourseId }
  | { type: 'differentTerm'; id: RuleId; courseIdA: CourseId; courseIdB: CourseId }
  | { type: 'mutualExclusion'; id: RuleId; courseIdA: CourseId; courseIdB: CourseId }
  | { type: 'cohort'; id: RuleId; studentIds: StudentId[]; courseId: CourseId };

export interface FeasibilityResult {
  feasible: boolean;
  /** Human-readable explanation, present only when feasible === false. */
  reason?: string;
  /**
   * If set, this is the same student's own already-committed request that's
   * causing the conflict. Bounded backtracking (solvers/greedy/backtrack.ts)
   * uses this to know which prior assignment to retry, instead of undoing
   * an arbitrary one. Only set for conflicts within a single student's own
   * schedule (sequencing, same-teacher, same/different-term, linked
   * sections, no-double-booking) -- never for cross-student conflicts like
   * capacity or cohort, which require the hybrid solver's repair pass.
   */
  conflictingRequestId?: RequestId;
}

/**
 * Assignments made so far during greedy construction. `byStudent` is the
 * source of truth; `bySection` is a derived index kept in sync by
 * rules/partialAssignment.ts so capacity/enrollment checks don't need an
 * O(n) scan over every assignment on every candidate check.
 */
export interface PartialAssignment {
  byStudent: Map<StudentId, Map<RequestId, SectionId>>;
  bySection: Map<SectionId, Set<StudentId>>;
}

export interface RuleContext {
  courses: Map<CourseId, Course>;
  sections: Map<SectionId, Section>;
  sectionsByCourse: Map<CourseId, Section[]>;
  terms: Map<string, Term>;
  students: Map<StudentId, Student>;
  requestsByStudent: Map<StudentId, StudentRequest[]>;
  teachers: Map<string, Teacher>;
}

/**
 * Every scheduling rule is defined once and consumed two ways: the greedy
 * solver calls checkFeasible() as it places one request at a time, while the
 * MIP solver calls addToMipModel() once up front to add linear constraints.
 */
export interface Rule {
  readonly id: RuleId;
  readonly type: string;
  readonly description: string;

  checkFeasible(
    ctx: RuleContext,
    partial: PartialAssignment,
    studentId: StudentId,
    requestId: RequestId,
    candidate: Section,
  ): FeasibilityResult;

  addToMipModel(ctx: RuleContext, model: MipModelBuilder, vars: VariableIndex): void;
}
