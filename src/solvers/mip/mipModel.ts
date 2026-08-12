export type VarKind = 'binary' | 'continuous';

export interface MipVariable {
  name: string;
  kind: VarKind;
  lb: number;
  ub: number;
}

export interface MipConstraintTerm {
  varName: string;
  coef: number;
}

export type ConstraintSense = '<=' | '>=' | '=';

export interface MipConstraint {
  name: string;
  terms: MipConstraintTerm[];
  sense: ConstraintSense;
  rhs: number;
}

export interface MipObjective {
  sense: 'max' | 'min';
  terms: MipConstraintTerm[];
}

export interface MipModel {
  variables: Map<string, MipVariable>;
  constraints: MipConstraint[];
  objective: MipObjective;
}

/**
 * Solver-agnostic in-memory model. Rules add variables/constraints/objective
 * terms here; lpFormatWriter later serializes the result to CPLEX LP text
 * for the `highs` solver. Keeping rules decoupled from LP syntax means the
 * solver backend could be swapped without touching any rule implementation.
 */
export class MipModelBuilder {
  private readonly variables = new Map<string, MipVariable>();
  private readonly constraints: MipConstraint[] = [];
  private readonly objectiveTerms: MipConstraintTerm[] = [];
  private constraintCounter = 0;

  addBinaryVar(name: string): void {
    if (this.variables.has(name)) return;
    this.variables.set(name, { name, kind: 'binary', lb: 0, ub: 1 });
  }

  addContinuousVar(name: string, lb: number, ub: number): void {
    if (this.variables.has(name)) return;
    this.variables.set(name, { name, kind: 'continuous', lb, ub });
  }

  hasVar(name: string): boolean {
    return this.variables.has(name);
  }

  /** Auto-generates a unique constraint name if one isn't supplied. */
  addConstraint(
    terms: MipConstraintTerm[],
    sense: ConstraintSense,
    rhs: number,
    name?: string,
  ): void {
    if (terms.length === 0) return;
    const constraintName = name ?? `c${this.constraintCounter++}`;
    this.constraints.push({ name: constraintName, terms, sense, rhs });
  }

  addToObjective(varName: string, coef: number): void {
    this.objectiveTerms.push({ varName, coef });
  }

  build(): MipModel {
    return {
      variables: this.variables,
      constraints: this.constraints,
      objective: { sense: 'max', terms: this.objectiveTerms },
    };
  }
}
