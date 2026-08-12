import type { RequestPriority } from '../../types/domain.js';

export const DEFAULT_WEIGHTS: Record<RequestPriority, number> = { required: 10, elective: 3, alternate: 1 };
export const DEFAULT_PREFERENCE_BONUS = 0.1;

export function defaultWeightFn(priority: RequestPriority): number {
  return DEFAULT_WEIGHTS[priority];
}
