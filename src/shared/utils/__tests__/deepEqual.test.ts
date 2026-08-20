import { deepEqual } from '../deepEqual';

describe('deepEqual', () => {
  test('primitives and Object.is semantics', () => {
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test('deep object and array content equality', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
  });

  test('key order does not matter, extra keys do', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  test('non-plain objects compare unequal unless reference-identical', () => {
    const date = new Date(1000);
    expect(deepEqual(date, date)).toBe(true);
    expect(deepEqual(new Date(1000), new Date(1000))).toBe(false);
    expect(deepEqual(new Map(), new Map())).toBe(false);
    expect(deepEqual(new Set([1]), new Set([1]))).toBe(false);
    expect(deepEqual({ a: new Date(1000) }, { a: new Date(1000) })).toBe(false);
  });
});
