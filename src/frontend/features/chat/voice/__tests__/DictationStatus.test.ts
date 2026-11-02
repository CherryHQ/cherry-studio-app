import { formatElapsed } from '../DictationStatus';

test('shows recording time as minutes and seconds', () => {
  expect(formatElapsed(0)).toBe('0:00');
  expect(formatElapsed(12_900)).toBe('0:12');
  expect(formatElapsed(600_000)).toBe('10:00');
});
