import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const expoDirectory = dirname(require.resolve('expo/package.json'));
const packageDirectory = dirname(
  require.resolve('expo-modules-core/package.json', { paths: [expoDirectory] }),
);

// Expo 58.0.29 includes expo/expo#52631. Keep the source regression guard after
// retiring our equivalent Swift hunk; compilation still requires the affected toolchain.
describe('Expo Modules Core Swift consuming-result compatibility', () => {
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
