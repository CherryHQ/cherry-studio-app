import { readFileSync } from 'node:fs';

describe('expo-widgets Live Activity patch', () => {
  test('keeps the compact trailing content close to the Dynamic Island edge', () => {
    const patch = readFileSync(`${process.cwd()}/patches/expo-widgets@57.0.8.patch`, 'utf8');

    expect(patch).toContain('+      .contentMargins(.trailing, 0, for: .compactTrailing)');
  });
});
