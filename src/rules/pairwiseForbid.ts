import type { CourseId } from '../types/ids.js';
import type { Section } from '../types/domain.js';
import type { MipModelBuilder } from '../solvers/mip/mipModel.js';
import type { VariableIndex } from '../solvers/mip/variableIndex.js';
import type { RuleContext } from '../types/rules.js';

/**
 * Shared MIP-building logic for rules of the shape "a student may not hold
 * both a section of course A and a section of course B when `forbidden`
 * says the specific pair conflicts" (sequencing, same-teacher, same/different
 * term all reduce to this). For every student who has candidate variables
 * for both courses, add x[i,secA] + x[i,secB] <= 1 for each conflicting pair.
 */
export function addPairwiseForbidConstraints(
  ctx: RuleContext,
  model: MipModelBuilder,
  vars: VariableIndex,
  courseIdA: CourseId,
  courseIdB: CourseId,
  forbidden: (secA: Section, secB: Section) => boolean,
): void {
  const sectionsA = ctx.sectionsByCourse.get(courseIdA) ?? [];
  const sectionsB = ctx.sectionsByCourse.get(courseIdB) ?? [];

  for (const studentId of vars.allStudentIds()) {
    for (const secA of sectionsA) {
      if (!vars.hasVar(studentId, secA.id)) continue;
      for (const secB of sectionsB) {
        if (!vars.hasVar(studentId, secB.id)) continue;
        if (!forbidden(secA, secB)) continue;

        model.addConstraint(
          [
            { varName: vars.varName(studentId, secA.id), coef: 1 },
            { varName: vars.varName(studentId, secB.id), coef: 1 },
          ],
          '<=',
          1,
        );
      }
    }
  }
}
