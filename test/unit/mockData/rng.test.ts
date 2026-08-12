import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randomInt, shuffle } from '../../../src/mockData/rng.js';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('always returns values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('stays within the inclusive bounds', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const v = randomInt(rng, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it('handles a single-value range', () => {
    const rng = mulberry32(3);
    expect(randomInt(rng, 4, 4)).toBe(4);
  });
});

describe('pick', () => {
  it('always returns an element from the array', () => {
    const rng = mulberry32(9);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pick(rng, items));
    }
  });

  it('throws on an empty array', () => {
    const rng = mulberry32(9);
    expect(() => pick(rng, [])).toThrow();
  });
});

describe('shuffle', () => {
  it('returns a permutation with the same elements', () => {
    const rng = mulberry32(11);
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(rng, items);
    expect(shuffled.sort()).toEqual(items.slice().sort());
  });

  it('does not mutate the input array', () => {
    const rng = mulberry32(11);
    const items = [1, 2, 3];
    const copy = [...items];
    shuffle(rng, items);
    expect(items).toEqual(copy);
  });

  it('is deterministic given the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(mulberry32(5), items);
    const b = shuffle(mulberry32(5), items);
    expect(a).toEqual(b);
  });
});
