import {
  DEFAULT_PI_OUTPUT_RESERVATION_TOKENS,
  resolvePiOutputReservation,
} from '../piOutputReservation';

test('defines the default request reservation', () => {
  expect(DEFAULT_PI_OUTPUT_RESERVATION_TOKENS).toBe(65_536);
});

test.each([
  [1_048_576, 1_048_576, 65_536],
  [1_048_576, 500_000, 65_536],
  [128_000, 1_048_576, 128_000],
  [127_999, 128_000, 127_999],
  [8_192, 8_192, 8_192],
  [64_000, 64_000, 64_000],
  [65_536, 65_536, 65_536],
])('resolves ceiling %s and window %s to %s', (ceiling, window, expected) => {
  expect(resolvePiOutputReservation(ceiling, window)).toBe(expected);
});

test.each([undefined, 0, -1, NaN, Infinity, -Infinity, 1.5])(
  'preserves the candidate for an unusable window %s',
  (window) => {
    expect(resolvePiOutputReservation(1_048_576, window)).toBe(1_048_576);
  },
);

test.each([0, -1, NaN, Infinity, -Infinity, 100_000.5])(
  'leaves invalid ceiling %s to existing validation',
  (ceiling) => {
    expect(resolvePiOutputReservation(ceiling, 8_192)).toBe(ceiling);
  },
);

test.each([512, 65_536, 131_072, 0, -1, NaN, Infinity, 1.5])(
  'preserves explicit budget %s without applying the default',
  (explicit) => {
    expect(resolvePiOutputReservation(1_048_576, 1_048_576, explicit)).toBe(explicit);
  },
);
