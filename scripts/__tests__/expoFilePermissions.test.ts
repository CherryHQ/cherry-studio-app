import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const packageDirectory = dirname(
  require.resolve('expo-modules-core/package.json', {
    paths: [dirname(require.resolve('expo/package.json'))],
  }),
);

// Guards delivery of the native fix; real download/cancel/delete acceptance needs a new APK.
describe('Android offline model storage permissions', () => {
  test('registers the installed Expo Modules Core patch and its lockfile hash', () => {
    const dependency = 'expo-modules-core@58.0.26';
    const patchPath = `patches/${dependency}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');

    expect(JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')).version).toBe(
      '58.0.26',
    );
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('treats no-backup storage as internal even before a model file exists', () => {
    const source = readFileSync(
      join(
        packageDirectory,
        'android/src/main/java/expo/modules/kotlin/services/FilePermissionService.kt',
      ),
      'utf8',
    );
    const internalPaths = source.slice(source.indexOf('private fun getInternalPaths('));

    expect(internalPaths).toContain('context.noBackupFilesDir.canonicalPath');
    expect(internalPaths).toContain('context.filesDir.canonicalPath');
    expect(internalPaths).toContain('context.cacheDir.canonicalPath');
    // Retain canonical containment, so sibling paths and traversal do not gain permissions.
    expect(source).toContain('val canonicalPath = File(path).canonicalPath');
    expect(source).toContain('canonicalPath.startsWith("$dir/") || dir == canonicalPath');
  });
});
