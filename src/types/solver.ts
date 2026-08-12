import type { Course, Period, Room, Section, Student, StudentRequest, Teacher, Term } from './domain.js';
import type { RequestPriority } from './domain.js';
import type { RuleDefinition } from './rules.js';
import type { ScheduleResult } from './result.js';

export interface SchedulingInput {
  students: Student[];
  requests: StudentRequest[];
  sections: Section[];
  courses: Course[];
  teachers: Teacher[];
  terms: Term[];
  periods: Period[];
  rooms?: Room[];
  rules: RuleDefinition[];
}

export interface SolveOptions {
  /** Objective weight per request priority tier. Defaults: required=10, elective=3, alternate=1. */
  weightFn?: (priority: RequestPriority) => number;
  /** Small objective bonus for matching a student's requestedTeacherId/requestedTermId preference. */
  preferenceBonus?: number;
  /** MIP solve time budget in seconds. */
  timeLimitSeconds?: number;
  /** MIP relative optimality gap to accept (0 = exact). */
  mipRelGap?: number;
  /** Max repair rounds for the hybrid solver. */
  maxRepairRounds?: number;
  /** Deterministic seed used for any tie-breaking randomness. */
  seed?: number;
}

export interface SolverStrategy {
  readonly name: string;
  solve(input: SchedulingInput, options?: SolveOptions): Promise<ScheduleResult>;
}
