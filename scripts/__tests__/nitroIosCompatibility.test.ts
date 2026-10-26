import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const packageName = 'react-native-nitro-modules';
const version = '0.36.4';
const dependency = `${packageName}@${version}`;
const packageDirectory = dirname(require.resolve(`${packageName}/package.json`));

// Guards patch delivery and the Swift-visible source paths behind #1442.
// Native symbol inspection and iOS 17 startup still require a new build.
describe('Nitro iOS 17 exception compatibility patch', () => {
  test('pins the installed dependency and registers the current patch hash', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
    const installed = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
    const patchPath = `patches/${dependency}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');

    expect(dependencies[packageName]).toBe(version);
    expect(installed.version).toBe(version);
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test.each(['ios/utils/RuntimeError.hpp', 'cpp/core/Promise.hpp'])(
    '%s avoids the exception factory that emits iOS 18-only symbols through Swift',
    (file) => {
      const source = readFileSync(join(packageDirectory, file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

      expect(code).not.toMatch(/\bstd::make_exception_ptr\s*\(/);
    },
  );
});
