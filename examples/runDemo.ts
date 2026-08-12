import { generateMockSchedule } from '../src/mockData/generateMockSchedule.js';
import { createGreedySolver } from '../src/solvers/greedy/greedySolver.js';
import { createMipSolver } from '../src/solvers/mip/mipSolver.js';
import { createHybridSolver } from '../src/solvers/hybrid/hybridSolver.js';
import type { ScheduleResult } from '../src/types/result.js';
import type { SolverStrategy } from '../src/types/solver.js';

const SOLVERS: SolverStrategy[] = [createGreedySolver(), createMipSolver(), createHybridSolver()];

/**
 * Generates the 'full' mock master schedule and runs it through all three
 * solver strategies, printing a comparison report. Returns the results
 * keyed by solver name so a test can assert against them without re-parsing
 * console output.
 */
export async function runDemo(): Promise<Record<string, ScheduleResult>> {
  const input = generateMockSchedule('full', 42);

  console.log("Weaver demo -- 'full' mock master schedule");
  console.log(
    `${input.students.length} students, ${input.requests.length} requests, ${input.sections.length} sections, ${input.courses.length} courses, ${input.rules.length} rules\n`,
  );

  const results: Record<string, ScheduleResult> = {};

  for (const solver of SOLVERS) {
    const start = Date.now();
    const result = await solver.solve(input);
    const elapsedMs = Date.now() - start;
    results[solver.name] = result;

    console.log(`--- ${solver.name} ---`);
    console.log(`fulfillment rate:          ${(result.fulfillmentRate * 100).toFixed(1)}%`);
    console.log(`unresolved requests:       ${result.unresolvedRequests.length}`);
    console.log(`hard-constraint violations: ${result.diagnostics.violations.length}`);
    console.log(
      `solve time:                ${elapsedMs}ms${result.diagnostics.solverStatus ? ` (status: ${result.diagnostics.solverStatus})` : ''}`,
    );

    if (result.unresolvedRequests.length > 0) {
      console.log('sample unresolved requests:');
      for (const u of result.unresolvedRequests.slice(0, 3)) {
        console.log(`  - ${u.studentId} / ${u.courseId}: ${u.reasons[0]}`);
      }
    }

    const mostUtilized = [...result.sectionUtilization]
      .sort((a, b) => b.utilizationRate - a.utilizationRate)
      .slice(0, 3);
    console.log('most-utilized sections:');
    for (const u of mostUtilized) {
      console.log(`  - ${u.sectionId}: ${u.enrolled}/${u.capacity} (${(u.utilizationRate * 100).toFixed(0)}%)`);
    }
    console.log();
  }

  return results;
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  await runDemo();
}
