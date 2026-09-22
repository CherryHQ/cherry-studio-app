import { timestampToISO } from '../rowMappers';

describe('rowMappers', () => {
  test('converts numeric timestamps to ISO strings', () => {
    expect(timestampToISO(Date.parse('2026-05-15T00:00:00.000Z'))).toBe('2026-05-15T00:00:00.000Z');
  });
});
