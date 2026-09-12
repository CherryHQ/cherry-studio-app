import { citeId, newCitePrefix } from '../citationIds';

describe('citation IDs', () => {
  test('uses the first UUID segment and one-based result indexes', () => {
    const prefix = newCitePrefix(() => '3f2a1b9c-aaaa-4bbb-8ccc-123456789abc');

    expect(prefix).toBe('3f2a1b9c');
    expect(citeId(prefix, 0)).toBe('3f2a1b9c-1');
    expect(citeId(prefix, 2)).toBe('3f2a1b9c-3');
  });
});
