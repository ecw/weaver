import type { Rule, RuleDefinition } from '../types/rules.js';
import { createLinkedSectionsRule } from './linkedSections.js';
import { createSequencingRule } from './sequencing.js';
import { createSameTeacherRule } from './sameTeacher.js';
import { createSameTermRule, createDifferentTermRule } from './sameOrDifferentTerm.js';
import { createMutualExclusionRule } from './mutualExclusion.js';
import { createCohortRule } from './cohort.js';
import { createBuiltinRules } from './builtins.js';
import { createGradeEligibilityRule } from './gradeEligibility.js';

/** Compiles a declarative, JSON-serializable RuleDefinition into a behavioral Rule. */
export function compileRule(def: RuleDefinition): Rule {
  switch (def.type) {
    case 'linkedSections':
      return createLinkedSectionsRule(def.id, def.sectionPairs);
    case 'sequencing':
      return createSequencingRule(def.id, def.earlierCourseId, def.laterCourseId);
    case 'sameTeacher':
      return createSameTeacherRule(def.id, def.courseIdA, def.courseIdB);
    case 'sameTerm':
      return createSameTermRule(def.id, def.courseIdA, def.courseIdB);
    case 'differentTerm':
      return createDifferentTermRule(def.id, def.courseIdA, def.courseIdB);
    case 'mutualExclusion':
      return createMutualExclusionRule(def.id, def.courseIdA, def.courseIdB);
    case 'cohort':
      return createCohortRule(def.id, def.studentIds, def.courseId);
  }
}

export function compileRules(defs: RuleDefinition[]): Rule[] {
  return defs.map(compileRule);
}

/** All rules that apply unconditionally, regardless of what the caller configured. */
export function allBuiltinRules(): Rule[] {
  return [...createBuiltinRules(), createGradeEligibilityRule()];
}
