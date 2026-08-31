import { parseSessionViewMode } from '../sessionViewMode';

describe('parseSessionViewMode', () => {
  it.each([
    [undefined, 'sessions'],
    ['sessions', 'sessions'],
    ['agents', 'agents'],
    ['unknown', 'sessions'],
    [['agents', 'sessions'], 'agents'],
  ] as const)('parses %p as %s', (value, expected) => {
    expect(parseSessionViewMode(value)).toBe(expected);
  });
});
