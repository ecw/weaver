import { describe, expect, it, vi } from 'vitest';
import { runDemo } from '../../examples/runDemo.js';

describe('runDemo smoke test', () => {
  it('runs all three solvers against the full mock schedule and returns their results', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const results = await runDemo();

      expect(Object.keys(results).sort()).toEqual(['greedy', 'hybrid', 'mip']);
      for (const result of Object.values(results)) {
        expect(result.fulfillmentRate).toBeGreaterThanOrEqual(0.9);
        expect(result.diagnostics.violations).toEqual([]);
      }
      expect(logSpy).toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  }, 20000);
});
