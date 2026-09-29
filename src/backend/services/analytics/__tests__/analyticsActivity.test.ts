import { localDateKey } from '../analyticsActivity';

it('keys on the device local day, not UTC', () => {
  // 00:30 local on the 2nd is still the previous UTC day in a positive offset.
  const localMidnightish = new Date(2026, 8, 2, 0, 30);
  expect(localDateKey(localMidnightish)).toBe('2026-09-02');
});

it('zero-pads month and day so keys compare as written', () => {
  expect(localDateKey(new Date(2026, 0, 5, 13, 0))).toBe('2026-01-05');
});
