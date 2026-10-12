import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const nativeSource = (packageName: string, file: string) =>
  readFileSync(join(dirname(require.resolve(`${packageName}/package.json`)), file), 'utf8');

// These guards check the Material dependency patch and installed version declaration.
// Android runtime behavior and Play Console results require separate native acceptance.
describe('Android Material compatibility patch', () => {
  test('retains the Screens patch registration and current lockfile hash', () => {
    const dependency = 'react-native-screens@4.26.2';
    const patchPath = `patches/${dependency}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('uses the Material release with guarded system-bar calls in native sheet dialogs', () => {
    expect(nativeSource('react-native-screens', 'android/build.gradle')).toContain(
      "implementation 'com.google.android.material:material:1.14.0'",
    );
  });
});
