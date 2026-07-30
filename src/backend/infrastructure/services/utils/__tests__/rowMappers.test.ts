import { nullsToUndefined, timestampToISO, timestampToISOOrUndefined } from '../rowMappers';

describe('rowMappers', () => {
  test('converts numeric timestamps to ISO strings', () => {
    expect(timestampToISO(Date.parse('2026-05-15T00:00:00.000Z'))).toBe('2026-05-15T00:00:00.000Z');
  });

  test('converts top-level nulls to undefined', () => {
    expect(nullsToUndefined({ a: null, b: 0, c: { nested: null } })).toEqual({
      a: undefined,
      b: 0,
      c: { nested: null },
    });
  });

  test('converts optional timestamps to ISO strings or undefined', () => {
    expect(timestampToISOOrUndefined(Date.parse('2026-05-15T00:00:00.000Z'))).toBe(
      '2026-05-15T00:00:00.000Z',
    );
    expect(timestampToISOOrUndefined(null)).toBeUndefined();
    expect(timestampToISOOrUndefined(undefined)).toBeUndefined();
  });
});
