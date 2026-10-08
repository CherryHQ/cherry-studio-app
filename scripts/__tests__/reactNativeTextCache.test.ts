import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const patch = readFileSync('patches/react-native@0.86.3.patch', 'utf8');
const cachePatch = patch
  .split('+++ b/ReactCommon/react/utils/SimpleThreadSafeCache.h\n')[1]
  ?.split('diff --git ')[0];
const iosMeasurementPatch = patch
  .split(
    '+++ b/ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/TextLayoutManager.mm\n',
  )[1]
  ?.split('diff --git ')[0];

// Patch guards protect native source wiring; C++ execution and device acceptance
// are separate checks. Token presence alone does not establish lock ownership.
describe('React Native text measurement cache patch', () => {
  test('pins the native cache patch with a current lockfile hash', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const version = dependencies['react-native'];
    const patchPath = `patches/react-native@${version}.patch`;
    const hash = createHash('sha256').update(patch).digest('hex');

    expect(version).toBe('0.86.3');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
      `react-native@${version}: ${patchPath}`,
    );
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
      `  react-native@${version}: ${hash}\n`,
    );
  });

  test('opts iOS measurements into unlocked generation while preserving the default generator lock', () => {
    expect(iosMeasurementPatch).toContain(
      '+      measurement = textMeasureCache_.getWithGeneratorOutsideLock(',
    );
    expect(iosMeasurementPatch).toContain(
      '+  auto measurement = lineMeasureCache_.getWithGeneratorOutsideLock(',
    );
    expect(cachePatch).toContain(
      '+    std::lock_guard<std::mutex> lock(mutex_);\n' +
        '     return getMapIterator(key, std::move(generator))->second->second;',
    );
  });

  test('releases the lookup lock before generation and locks the returned-value copy', () => {
    const unlockedGet = cachePatch
      ?.split('+  ValueT getWithGeneratorOutsideLock(')[1]
      ?.split('\n   }')[0]
      ?.replace(/^\+/gm, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(unlockedGet).toMatch(/const\s*\{\s*\{\s*std::lock_guard<std::mutex> lock\(mutex_\);/);
    expect(unlockedGet).toMatch(
      /\}\s*\}\s*auto value = generator\(\);\s*std::lock_guard<std::mutex> lock\(mutex_\);\s*return getMapIterator\(key, \[&value\]\(\) \{ return std::move\(value\); \}\)->second->second;/,
    );
  });

  test('enables React Native source compilation on iOS so the cache patch takes effect', () => {
    const { expo } = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: { plugins: (string | [string, { ios?: { buildReactNativeFromSource?: boolean } }])[] };
    };
    const buildProperties = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(
      Array.isArray(buildProperties) && buildProperties[1].ios?.buildReactNativeFromSource,
    ).toBe(true);
  });
});
