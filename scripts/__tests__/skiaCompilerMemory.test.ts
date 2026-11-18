import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const packageName = '@shopify/react-native-skia';
const version = '2.14.0';
const dependency = `${packageName}@${version}`;
const packageDirectory = dirname(require.resolve(`${packageName}/package.json`));

// Guards the compilation graph behind upstream Skia #4272. Compiler peak memory
// and Android/iOS integration still require separately authorized native builds.
describe('Skia compiler memory patch', () => {
  test('pins the installed dependency and registers the current patch hash', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
    const installed = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
    const patchPath = `patches/@shopify__react-native-skia@${version}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');

    expect(dependencies[packageName]).toBe(version);
    expect(installed.version).toBe(version);
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`'${dependency}': ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  '${dependency}': ${hash}\n`);
  });

  test('compiles the full JSI API in one shared C++ translation unit', () => {
    const cmake = readFileSync(join(packageDirectory, 'android/CMakeLists.txt'), 'utf8');
    const heavySources = [...cmake.matchAll(/"\$\{PROJECT_SOURCE_DIR\}\/([^"]+\.cpp)"/g)]
      .map(([, source]) => resolve(packageDirectory, 'android', source))
      .filter((source) => readFileSync(source, 'utf8').includes('#include "api/JsiSkApi.h"'))
      .map((source) => relative(packageDirectory, source));

    expect(heavySources).toEqual(['cpp/rnskia/RNSkManager.cpp']);
  });

  test('removes the old definitions from the shared CocoaPods source glob', () => {
    expect(existsSync(join(packageDirectory, 'cpp/jsi/ViewProperty.cpp'))).toBe(false);
    expect(existsSync(join(packageDirectory, 'cpp/rnskia/RNSkPictureView.cpp'))).toBe(false);
  });
});
