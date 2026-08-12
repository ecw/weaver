import type {
  CourseId,
  PeriodId,
  RequestId,
  RoomId,
  SectionId,
  StudentId,
  SubgroupId,
  TeacherId,
  TermId,
} from './ids.js';

/**
 * A term's granularity within the school year. Terms nest: a 'year' term
 * contains 'semester' terms, which contain 'quarter'/'trimester' terms.
 */
export type TermType = 'year' | 'semester' | 'trimester' | 'quarter' | 'custom';

/**
 * Terms are positioned on a shared timeline of "atomic scheduling units"
 * (1-12 for a standard year, see terms/termCalendar.ts) so that overlap,
 * containment, and before/after comparisons reduce to interval arithmetic.
 */
export interface Term {
  id: TermId;
  name: string;
  type: TermType;
  parentId: TermId | null;
  startUnit: number;
  endUnit: number;
}

export interface Period {
  id: PeriodId;
  name: string;
  sortOrder: number;
}

export interface Course {
  id: CourseId;
  name: string;
  credits?: number;
  minGrade?: number;
  maxGrade?: number;
}

export interface Teacher {
  id: TeacherId;
  name: string;
}

export interface Room {
  id: RoomId;
  name: string;
  capacity?: number;
}

export interface ReservedSeatBlock {
  subgroupId: SubgroupId;
  seats: number;
}

export interface Section {
  id: SectionId;
  courseId: CourseId;
  teacherId: TeacherId;
  termId: TermId;
  periodId: PeriodId;
  roomId?: RoomId;
  capacity: number;
  /** Seats carved out for students matching one of the student's subgroupIds. */
  reservedSeats?: ReservedSeatBlock[];
  /** Explicit paired sections (e.g. lab + lecture) that must be co-assigned. */
  linkedSectionIds?: SectionId[];
}

export interface Student {
  id: StudentId;
  name: string;
  gradeLevel: number;
  cohortIds?: string[];
  subgroupIds?: SubgroupId[];
}

export type RequestPriority = 'required' | 'elective' | 'alternate';

export interface StudentRequest {
  id: RequestId;
  studentId: StudentId;
  courseId: CourseId;
  priority: RequestPriority;
  requestedTeacherId?: TeacherId;
  requestedTermId?: TermId;
  /** If this is an alternate/backup, the request it substitutes for. */
  alternateForRequestId?: RequestId;
}
