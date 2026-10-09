import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { copyJson } from '@earendil-works/chord';
import { track } from '@earendil-works/chord/delta';

describe('Pi Chord JSON compatibility', () => {
  test('copies a tracked partial when Hermes forwards numeric descriptor keys to a Proxy', () => {
    const change = track({ content: [{ type: 'text', text: 'Partial answer' }] }).beginChange();
    const partial = change.state.content;
    const descriptor = Object.getOwnPropertyDescriptor;
    const lookup = jest
      .spyOn(Object, 'getOwnPropertyDescriptor')
      .mockImplementation((value, key) => {
        // Chord's array draft accepts string index keys. Hermes can forward the numeric key as-is.
        if (value === partial && typeof key === 'number') return undefined;
        return descriptor(value, key);
      });
    try {
      const copied = copyJson({ content: partial });
      expect(copied).toEqual({ content: [{ type: 'text', text: 'Partial answer' }] });
      partial[0].text = 'Later answer';
      expect(copied).toEqual({ content: [{ type: 'text', text: 'Partial answer' }] });
    } finally {
      lookup.mockRestore();
      change.abort();
    }
  });

  test('pins the installed compatibility fix to its patch and lockfile', () => {
    const patchPath = 'patches/@earendil-works__chord@1.1.0.patch';
    const patch = readFileSync(patchPath, 'utf8');
    const hash = createHash('sha256').update(patch).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
      `'@earendil-works/chord@1.1.0': ${patchPath}`,
    );
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
      `  '@earendil-works/chord@1.1.0': ${hash}\n`,
    );
  });
});
