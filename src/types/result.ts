import type { CourseId, RequestId, SectionId, StudentId } from './ids.js';

export interface FulfilledRequest {
  requestId: RequestId;
  studentId: StudentId;
  sectionId: SectionId;
}

export interface UnresolvedRequest {
  requestId: RequestId;
  studentId: StudentId;
  courseId: CourseId;
  reasons: string[];
}

export interface SectionUtilization {
  sectionId: SectionId;
  capacity: number;
  enrolled: number;
  utilizationRate: number;
}

export interface ScheduleDiagnostics {
  durationMs: number;
  solverStatus?: string;
  /** Hard-constraint violations found by the post-hoc validation pass. Should always be empty. */
  violations: string[];
}

export interface ScheduleResult {
  assignments: Map<StudentId, SectionId[]>;
  fulfilledRequests: FulfilledRequest[];
  unresolvedRequests: UnresolvedRequest[];
  sectionUtilization: SectionUtilization[];
  /** Fraction of all requests fulfilled (unweighted request count, not priority-weighted). */
  fulfillmentRate: number;
  solverName: string;
  diagnostics: ScheduleDiagnostics;
}
