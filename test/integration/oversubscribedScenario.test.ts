import { beforeAll, describe, expect, it } from 'vitest';
import { generateMockSchedule } from '../../src/mockData/generateMockSchedule.js';
import { createHybridSolver } from '../../src/solvers/hybrid/hybridSolver.js';
import { createGreedySolver } from '../../src/solvers/greedy/greedySolver.js';
import type { ScheduleResult } from '../../src/types/result.js';

const input = generateMockSchedule('oversubscribed', 42);

describe('oversubscribed scenario', () => {
  let result: ScheduleResult;

  beforeAll(async () => {
    result = await createHybridSolver().solve(input);
  }, 20000);

  it('fulfillment is meaningfully below 100% -- scarcity is real, not a solver artifact', () => {
    expect(result.fulfillmentRate).toBeLessThan(0.99);
    expect(result.unresolvedRequests.length).toBeGreaterThan(0);
  });

  it('still produces zero hard-constraint violations under scarcity', () => {
    expect(result.diagnostics.violations).toEqual([]);
  });

  it('every unresolved request has a specific, non-empty reason', () => {
    for (const unresolved of result.unresolvedRequests) {
      expect(unresolved.reasons.length).toBeGreaterThan(0);
      for (const reason of unresolved.reasons) {
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('the deliberately over-requested Film Studies elective shows real unfulfilled demand', () => {
    const filmUnresolved = result.unresolvedRequests.filter((u) => u.courseId === 'FILM_STUDIES');
    expect(filmUnresolved.length).toBeGreaterThan(0);

    const filmUtil = result.sectionUtilization.find((u) => u.sectionId === 'FILM_STUDIES-A');
    expect(filmUtil?.enrolled).toBe(filmUtil?.capacity); // fully packed, not just under-filled
  });

  it('the unresolvable period-conflict cluster produces genuinely unresolved requests', () => {
    const conflictUnresolved = result.unresolvedRequests.filter(
      (u) => u.courseId === 'CONFLICT_COURSE' || u.courseId.startsWith('ENGLISH'),
    );
    expect(conflictUnresolved.length).toBeGreaterThan(0);
  });

  it('the reserved-seat carve-out is still respected under scarcity', () => {
    const roboticsSection = input.sections.find((s) => s.id === 'ROBOTICS-A')!;
    const reserved = roboticsSection.reservedSeats![0]!;
    const iepStudents = new Set(input.students.filter((s) => s.subgroupIds?.includes('iep')).map((s) => s.id));

    let nonMemberCount = 0;
    for (const [studentId, sectionIds] of result.assignments) {
      if (sectionIds.includes('ROBOTICS-A') && !iepStudents.has(studentId)) nonMemberCount++;
    }
    expect(nonMemberCount).toBeLessThanOrEqual(roboticsSection.capacity - reserved.seats);
  });

  it('hybrid does at least as well as greedy alone on the same oversubscribed input', async () => {
    const greedyResult = await createGreedySolver().solve(input);
    expect(result.fulfillmentRate).toBeGreaterThanOrEqual(greedyResult.fulfillmentRate - 1e-9);
  }, 20000);
});
