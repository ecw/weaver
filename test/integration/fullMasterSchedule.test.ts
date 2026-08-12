import { beforeAll, describe, expect, it } from 'vitest';
import { generateMockSchedule } from '../../src/mockData/generateMockSchedule.js';
import { createGreedySolver } from '../../src/solvers/greedy/greedySolver.js';
import { createMipSolver } from '../../src/solvers/mip/mipSolver.js';
import { createHybridSolver } from '../../src/solvers/hybrid/hybridSolver.js';
import { termFullyBefore } from '../../src/terms/termCalendar.js';
import type { ScheduleResult } from '../../src/types/result.js';
import type { SchedulingInput, SolverStrategy } from '../../src/types/solver.js';
import type { Section } from '../../src/types/domain.js';

const input = generateMockSchedule('full', 42);
const sectionsById = new Map<string, Section>(input.sections.map((s) => [s.id, s]));
const termsById = new Map(input.terms.map((t) => [t.id, t]));

function sectionsForStudent(result: ScheduleResult, studentId: string): Section[] {
  return (result.assignments.get(studentId) ?? []).map((id) => sectionsById.get(id)!).filter(Boolean);
}

function hasCourse(sections: Section[], courseId: string): Section | undefined {
  return sections.find((s) => s.courseId === courseId);
}

const solvers: SolverStrategy[] = [createGreedySolver(), createMipSolver(), createHybridSolver()];

describe.each(solvers.map((s) => [s.name, s] as const))('full master schedule via %s solver', (_name, solver) => {
  let result: ScheduleResult;

  beforeAll(async () => {
    result = await solver.solve(input);
  }, 20000);

  it('fulfills at least 90% of requests', () => {
    expect(result.fulfillmentRate).toBeGreaterThanOrEqual(0.9);
  });

  it('produces zero hard-constraint violations', () => {
    expect(result.diagnostics.violations).toEqual([]);
  });

  it('never double-books a student into two sections at the same time', () => {
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      for (let i = 0; i < sections.length; i++) {
        for (let j = i + 1; j < sections.length; j++) {
          const a = sections[i]!;
          const b = sections[j]!;
          if (a.periodId !== b.periodId) continue;
          const termA = termsById.get(a.termId)!;
          const termB = termsById.get(b.termId)!;
          const overlaps = termA.startUnit <= termB.endUnit && termB.startUnit <= termA.endUnit;
          expect(overlaps, `${studentId} double-booked: ${a.id} and ${b.id} share period ${a.periodId}`).toBe(false);
        }
      }
    }
  });

  it('never exceeds a section capacity', () => {
    for (const util of result.sectionUtilization) {
      expect(util.enrolled, `${util.sectionId} over capacity`).toBeLessThanOrEqual(util.capacity);
    }
  });

  it('honors the linked-sections rule: Biology Lab and Lecture are always co-assigned', () => {
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      const lab = hasCourse(sections, 'BIOLAB');
      const lec = hasCourse(sections, 'BIOLEC');
      expect(Boolean(lab)).toBe(Boolean(lec));
    }
    // At least one student actually exercises the rule (not vacuously true).
    const someLinked = [...result.assignments.keys()].some((sid) => hasCourse(sectionsForStudent(result, sid), 'BIOLAB'));
    expect(someLinked).toBe(true);
  });

  it('honors the sequencing rule: Intro Programming is always in an earlier term than AP Programming', () => {
    let checked = 0;
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      const intro = hasCourse(sections, 'INTRO_CS');
      const ap = hasCourse(sections, 'AP_CS');
      if (intro && ap) {
        checked++;
        const introTerm = termsById.get(intro.termId)!;
        const apTerm = termsById.get(ap.termId)!;
        expect(termFullyBefore(introTerm, apTerm)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('honors the same-teacher rule: Band and Jazz Band share a teacher whenever both are taken', () => {
    let checked = 0;
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      const band = hasCourse(sections, 'BAND');
      const jazz = hasCourse(sections, 'JAZZ_BAND');
      if (band && jazz) {
        checked++;
        expect(band.teacherId).toBe(jazz.teacherId);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('honors mutual exclusion: no student ends up with both Spanish I and French I', () => {
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      const hasBoth = hasCourse(sections, 'SPANISH1') && hasCourse(sections, 'FRENCH1');
      expect(hasBoth).toBeFalsy();
    }
  });

  it('honors the cohort rule: every Team Blue member lands in the same Science 6 section', () => {
    const cohortRule = input.rules.find((r) => r.type === 'cohort');
    expect(cohortRule?.type).toBe('cohort');
    if (cohortRule?.type !== 'cohort') return;

    const sectionsUsed = new Set(
      cohortRule.studentIds.map((sid) => hasCourse(sectionsForStudent(result, sid), 'SCIENCE6')?.id).filter(Boolean),
    );
    expect(sectionsUsed.size).toBe(1);
  });

  it('honors the reserved-seat carve-out: non-IEP Robotics enrollment never exceeds capacity minus reserved seats', () => {
    const roboticsSection = sectionsById.get('ROBOTICS-A')!;
    const reserved = roboticsSection.reservedSeats![0]!;
    const iepStudents = new Set(input.students.filter((s) => s.subgroupIds?.includes('iep')).map((s) => s.id));

    let nonMemberCount = 0;
    for (const [studentId] of result.assignments) {
      const sections = sectionsForStudent(result, studentId);
      if (hasCourse(sections, 'ROBOTICS') && !iepStudents.has(studentId)) nonMemberCount++;
    }
    expect(nonMemberCount).toBeLessThanOrEqual(roboticsSection.capacity - reserved.seats);
  });
});

describe('solver comparison on the same full master schedule', () => {
  it('every solver reaches at least as good a fulfillment rate as greedy alone', async () => {
    const [greedyResult, mipResult, hybridResult] = await Promise.all([
      createGreedySolver().solve(input as SchedulingInput),
      createMipSolver().solve(input as SchedulingInput),
      createHybridSolver().solve(input as SchedulingInput),
    ]);
    expect(mipResult.fulfillmentRate).toBeGreaterThanOrEqual(greedyResult.fulfillmentRate - 1e-9);
    expect(hybridResult.fulfillmentRate).toBeGreaterThanOrEqual(greedyResult.fulfillmentRate - 1e-9);
  }, 20000);
});
