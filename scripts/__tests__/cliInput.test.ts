import { isAbsolute } from 'node:path';

import { requireCliPath, requireSafeId } from '../cliInput';

describe('cliInput', () => {
  it('accepts plain ids and rejects path-like ids', () => {
    expect(requireSafeId('12345', '--run-id')).toBe('12345');
    expect(requireSafeId('manual-1.2_x', '--run-id')).toBe('manual-1.2_x');
    for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'a..b', '.hidden', 'a\nb', 'a b']) {
      expect(() => requireSafeId(bad, '--run-id')).toThrow(/Invalid --run-id/);
    }
  });

  it('returns absolute paths and rejects empty or control characters', () => {
    expect(isAbsolute(requireCliPath('notes.md', '--notes-file'))).toBe(true);
    for (const bad of ['', '   ', 'a\0b', 'a\nb']) {
      expect(() => requireCliPath(bad, '--notes-file')).toThrow(/Invalid --notes-file/);
    }
  });
});
