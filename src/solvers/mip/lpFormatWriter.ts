import type { MipConstraintTerm, MipModel } from './mipModel.js';

/**
 * CPLEX LP row/column labels must start with a letter and may only contain
 * [A-Za-z0-9_]. Our constraint names are human-readable for debugging
 * (e.g. "cap_BIO101-A") and can contain characters LP format rejects, so
 * they're sanitized here at serialization time -- the original name is
 * still what tests and diagnostics see; only the text written to HiGHS changes.
 */
function sanitizeLabel(raw: string, index: number): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_');
  const safe = /^[A-Za-z]/.test(cleaned) ? cleaned : `r${index}_${cleaned}`;
  return safe.slice(0, 200);
}

function formatTerm(term: MipConstraintTerm, isFirst: boolean): string {
  const sign = term.coef < 0 ? '-' : isFirst ? '' : '+';
  const magnitude = Math.abs(term.coef);
  const coefText = magnitude === 1 ? '' : `${magnitude} `;
  return isFirst && sign === '' ? `${coefText}${term.varName}` : `${sign} ${coefText}${term.varName}`;
}

function formatExpr(terms: MipConstraintTerm[]): string {
  return terms.map((term, i) => formatTerm(term, i === 0)).join(' ');
}

/** Serializes a solver-agnostic MipModel to CPLEX LP format text, as expected by `highs.solve()`. */
export function writeLpFormat(model: MipModel): string {
  const lines: string[] = [];

  lines.push(model.objective.sense === 'max' ? 'Maximize' : 'Minimize');
  lines.push(` obj: ${formatExpr(model.objective.terms) || '0'}`);

  lines.push('Subject To');
  model.constraints.forEach((constraint, i) => {
    const label = sanitizeLabel(constraint.name, i);
    lines.push(` ${label}: ${formatExpr(constraint.terms)} ${constraint.sense} ${constraint.rhs}`);
  });

  const continuousVars = [...model.variables.values()].filter((v) => v.kind === 'continuous');
  if (continuousVars.length > 0) {
    lines.push('Bounds');
    for (const v of continuousVars) {
      lines.push(` ${v.lb} <= ${v.name} <= ${v.ub}`);
    }
  }

  const binaryVars = [...model.variables.values()].filter((v) => v.kind === 'binary');
  if (binaryVars.length > 0) {
    lines.push('Binaries');
    lines.push(` ${binaryVars.map((v) => v.name).join(' ')}`);
  }

  lines.push('End');
  return lines.join('\n');
}
