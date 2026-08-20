import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

/**
 * Storybook shipped unreachable for a while. The scripts exported
 * `STORYBOOK_ENABLED`, but Babel only inlines the `EXPO_PUBLIC_` prefix, so the
 * flag never reached the bundle — and nothing imported `.rnstorybook` anyway.
 * Neither half failed loudly: `pnpm storybook` simply launched the app. These
 * assertions pin the three places that have to agree for the switch to exist.
 */
describe('Storybook entry wiring', () => {
  const entry = read('index.ts');
  const flag = /process\.env\.(EXPO_PUBLIC_[A-Z_]+)/.exec(entry)?.[1];

  test('the entry branches on a bundle-visible flag and can reach both roots', () => {
    expect(flag).toBeDefined();
    expect(entry).toContain("require('./.rnstorybook')");
    expect(entry).toContain("require('expo-router/entry')");
  });

  test('package.json boots through that entry and sets the same flag', () => {
    const manifest = JSON.parse(read('package.json')) as {
      main: string;
      scripts: Record<string, string>;
    };

    expect(manifest.main).toBe('index.ts');
    for (const script of ['storybook', 'storybook:clear']) {
      expect(manifest.scripts[script]).toContain(`${flag}=true`);
    }
  });

  test('metro strips Storybook from the bundle using the same flag', () => {
    expect(read('metro.config.js')).toContain(`process.env.${flag} === 'true'`);
  });

  test('collects package primitives and application presentation stories', () => {
    const main = read('.rnstorybook/main.ts');
    const generated = read('.rnstorybook/storybook.requires.ts');

    expect(main).toContain('../packages/ui/stories/**/*.stories.?(ts|tsx|js|jsx)');
    expect(main).toContain('./stories/**/*.stories.?(ts|tsx|js|jsx)');
    expect(generated).toContain('../packages/ui/stories');
    expect(generated).toContain('./.rnstorybook/stories');
  });
});
