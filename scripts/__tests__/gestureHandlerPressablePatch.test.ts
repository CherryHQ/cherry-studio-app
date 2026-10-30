import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('pins the Android deferred-press patch in both published JavaScript entry paths', () => {
  const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const { version } = JSON.parse(
    readFileSync('node_modules/react-native-gesture-handler/package.json', 'utf8'),
  ) as { version: string };
  const patchPath = `patches/react-native-gesture-handler@${version}.patch`;
  const patch = readFileSync(patchPath, 'utf8');
  const hash = createHash('sha256').update(patch).digest('hex');

  expect(version).toBe('3.3.0');
  expect(dependencies['react-native-gesture-handler']).toBe('~3.3.0');
  expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
    `react-native-gesture-handler@${version}: ${patchPath}`,
  );
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
    `  react-native-gesture-handler@${version}: ${hash}\n`,
  );
  for (const path of [
    'src/v3/components/StatefulPressable.tsx',
    'lib/module/v3/components/StatefulPressable.js',
  ]) {
    expect(patch).toContain(`+++ b/${path}`);
    expect(readFileSync(`node_modules/react-native-gesture-handler/${path}`, 'utf8')).toMatch(
      /Platform\.OS === 'android' &&\s*!isScreenReaderEnabled &&\s*requireToFail == null/,
    );
  }
});
