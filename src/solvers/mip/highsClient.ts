import { createRequire } from 'node:module';

export interface HighsSolveOptions {
  timeLimitSeconds?: number;
  mipRelGap?: number;
}

export interface HighsSolveResult {
  status: string;
  objectiveValue: number;
  /** Present (with a numeric Primal) for every column when the solve found a solution; absent columns/fields on infeasible results. */
  columns: Record<string, { Primal?: number }>;
}

interface HighsRawSolution {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, { Primal?: number }>;
}

interface HighsInstance {
  solve(problem: string, options?: Record<string, unknown>): HighsRawSolution;
}

type HighsLoader = (options?: { locateFile?: (file: string) => string }) => Promise<HighsInstance>;

// `highs` is a CommonJS package whose .d.ts uses an ESM-style `export default`,
// which TypeScript's NodeNext resolution can't cleanly unwrap when importing it
// from an ESM file (its type ends up resolving to the whole module namespace
// instead of the loader function). Loading it via createRequire sidesteps that
// mismatch entirely -- `highs` genuinely is CJS, so this is exactly how Node
// itself loads it under the hood anyway.
const require = createRequire(import.meta.url);
const loadHighs = require('highs') as HighsLoader;

// WASM initialization is expensive (~seconds), so it happens at most once per process.
let highsPromise: ReturnType<HighsLoader> | undefined;

async function getHighs(): Promise<HighsInstance> {
  if (!highsPromise) {
    highsPromise = loadHighs();
  }
  return highsPromise;
}

export async function solveLp(lpText: string, options: HighsSolveOptions = {}): Promise<HighsSolveResult> {
  const highs = await getHighs();
  const solution = highs.solve(lpText, {
    output_flag: false,
    time_limit: options.timeLimitSeconds ?? 30,
    mip_rel_gap: options.mipRelGap ?? 1e-4,
  });

  return {
    status: solution.Status,
    objectiveValue: solution.ObjectiveValue,
    columns: solution.Columns ?? {},
  };
}
