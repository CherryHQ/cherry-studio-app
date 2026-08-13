import { formatElapsedTime, isTerminalPhase } from '../LiveActivityPreview';

describe('LiveActivityPreview', () => {
  test.each([
    [0, '0:00'],
    [7, '0:07'],
    [67, '1:07'],
    [3661, '1:01:01'],
    [-1, '0:00'],
  ])('formats %s seconds like the native timer', (seconds, expected) => {
    expect(formatElapsedTime(seconds)).toBe(expected);
  });

  test.each(['cancelled', 'completed', 'failed'] as const)('%s is terminal', (phase) => {
    expect(isTerminalPhase(phase)).toBe(true);
  });

  test.each(['responding', 'thinking', 'generating'] as const)('%s keeps running', (phase) => {
    expect(isTerminalPhase(phase)).toBe(false);
  });
});
