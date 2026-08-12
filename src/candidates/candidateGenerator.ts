import type { Course, Section, Student, StudentRequest } from '../types/domain.js';

export interface Candidate {
  section: Section;
  matchesTeacherPreference: boolean;
  matchesTermPreference: boolean;
}

export function isGradeEligible(course: Course, student: Student): boolean {
  if (course.minGrade !== undefined && student.gradeLevel < course.minGrade) return false;
  if (course.maxGrade !== undefined && student.gradeLevel > course.maxGrade) return false;
  return true;
}

/**
 * Sections a request could plausibly be assigned to: course must match and
 * the student must be grade-eligible for the course. Teacher/term requests
 * are treated as soft preferences (used for candidate ranking and a small
 * objective bonus), not hard filters, so a student isn't left unscheduled
 * just because their preferred teacher's section is full.
 */
export function generateCandidates(
  sectionsForCourse: Section[],
  request: StudentRequest,
  student: Student,
  course: Course,
): Candidate[] {
  if (!isGradeEligible(course, student)) return [];

  return sectionsForCourse
    .filter((section) => section.courseId === request.courseId)
    .map((section) => ({
      section,
      matchesTeacherPreference:
        request.requestedTeacherId === undefined ||
        section.teacherId === request.requestedTeacherId,
      matchesTermPreference:
        request.requestedTermId === undefined || section.termId === request.requestedTermId,
    }));
}
