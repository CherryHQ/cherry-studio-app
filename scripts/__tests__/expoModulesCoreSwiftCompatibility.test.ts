import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dependency = 'expo-modules-core@58.0.26';
const expoDirectory = dirname(require.resolve('expo/package.json'));
const packageDirectory = dirname(
  require.resolve('expo-modules-core/package.json', { paths: [expoDirectory] }),
);

// Backports expo/expo#52631. Compilation with the affected Swift toolchain is
// still required; these guards protect patch delivery in platform-independent CI.
describe('Expo Modules Core Swift consuming-result compatibility patch', () => {
  test('registers the patch hash for the dependency actually resolved by Expo', () => {
    const installed = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
    const patchPath = `patches/${dependency}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');

    expect(installed.version).toBe('58.0.26');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('forwards consuming results without the error cast that crashes Swift SILGen', () => {
    const source = readFileSync(
      join(packageDirectory, 'ios/Core/Functions/AsyncFunctionDefinition.swift'),
      'utf8',
    );

    expect(source).toMatch(
      /switch consume result\s*\{\s*case \.success\(let value\):\s*promise\.resolve\(value\)\s*case \.failure\(let error\):\s*promise\.reject\(error\)/,
    );
    expect(source).not.toMatch(/case \.failure\(let error as any Error\)/);
  });
});
