// Domain types
export type { StudentId, SectionId, CourseId, TeacherId, TermId, PeriodId, RoomId, RequestId, RuleId, SubgroupId, CohortId } from './types/ids.js';
export type {
  Term,
  TermType,
  Period,
  Course,
  Teacher,
  Room,
  Section,
  ReservedSeatBlock,
  Student,
  StudentRequest,
  RequestPriority,
} from './types/domain.js';
export type { RuleDefinition, Rule, RuleContext, FeasibilityResult, PartialAssignment } from './types/rules.js';
export type { SchedulingInput, SolveOptions, SolverStrategy } from './types/solver.js';
export type {
  ScheduleResult,
  FulfilledRequest,
  UnresolvedRequest,
  SectionUtilization,
  ScheduleDiagnostics,
} from './types/result.js';

// Solvers
export { createGreedySolver } from './solvers/greedy/greedySolver.js';
export { createMipSolver } from './solvers/mip/mipSolver.js';
export { createHybridSolver } from './solvers/hybrid/hybridSolver.js';

// Rule engine (for consumers who want to compile/inspect rules directly)
export { compileRule, compileRules, allBuiltinRules } from './rules/ruleEngine.js';

// Term calendar helpers
export { termsOverlap, termContains, termFullyBefore, termFullyAfter } from './terms/termCalendar.js';

// Mock data generator, useful for demos, examples, and tests
export { generateMockSchedule } from './mockData/generateMockSchedule.js';
export type { MockPreset } from './mockData/presets.js';
