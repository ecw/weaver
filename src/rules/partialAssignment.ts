import type { RequestId, SectionId, StudentId } from '../types/ids.js';
import type { PartialAssignment } from '../types/rules.js';

export function createPartialAssignment(): PartialAssignment {
  return { byStudent: new Map(), bySection: new Map() };
}

export function assign(
  partial: PartialAssignment,
  studentId: StudentId,
  requestId: RequestId,
  sectionId: SectionId,
): void {
  let requests = partial.byStudent.get(studentId);
  if (!requests) {
    requests = new Map();
    partial.byStudent.set(studentId, requests);
  }
  requests.set(requestId, sectionId);

  let roster = partial.bySection.get(sectionId);
  if (!roster) {
    roster = new Set();
    partial.bySection.set(sectionId, roster);
  }
  roster.add(studentId);
}

export function unassign(partial: PartialAssignment, studentId: StudentId, requestId: RequestId): void {
  const requests = partial.byStudent.get(studentId);
  if (!requests) return;
  const sectionId = requests.get(requestId);
  if (sectionId === undefined) return;
  requests.delete(requestId);
  partial.bySection.get(sectionId)?.delete(studentId);
}

export function sectionOf(
  partial: PartialAssignment,
  studentId: StudentId,
  requestId: RequestId,
): SectionId | undefined {
  return partial.byStudent.get(studentId)?.get(requestId);
}

export function studentSections(partial: PartialAssignment, studentId: StudentId): SectionId[] {
  const requests = partial.byStudent.get(studentId);
  return requests ? [...requests.values()] : [];
}

export function enrollmentCount(partial: PartialAssignment, sectionId: SectionId): number {
  return partial.bySection.get(sectionId)?.size ?? 0;
}

/** Which of a student's requests currently holds the given section, if any. */
export function requestIdForSection(
  partial: PartialAssignment,
  studentId: StudentId,
  sectionId: SectionId,
): RequestId | undefined {
  const requests = partial.byStudent.get(studentId);
  if (!requests) return undefined;
  for (const [requestId, assignedSectionId] of requests) {
    if (assignedSectionId === sectionId) return requestId;
  }
  return undefined;
}
