import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

describe('React Native text measurement cache patch', () => {
  test('pins and installs the native cache patch with a current lockfile hash', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const version = dependencies['react-native'];
    const patchPath = `patches/react-native@${version}.patch`;
    const patch = readFileSync(patchPath, 'utf8');
    const hash = createHash('sha256').update(patch).digest('hex');

    expect(version).toBe('0.86.3');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
      `react-native@${version}: ${patchPath}`,
    );
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
      `  react-native@${version}: ${hash}\n`,
    );
    expect(patch).toContain('+    auto value = generator();');
    expect(patch).toContain(
      '+    return getMapIterator(key, [&value]() { return value; })->second->second;',
    );
  });

  test('opts iOS measurements into unlocked generation while preserving the default generator lock', () => {
    const patch = readFileSync('patches/react-native@0.86.3.patch', 'utf8');

    expect(patch).toContain('+  ValueT getWithGeneratorOutsideLock(');
    expect(patch).toContain('+      measurement = textMeasureCache_.getWithGeneratorOutsideLock(');
    expect(patch).toContain('+  auto measurement = lineMeasureCache_.getWithGeneratorOutsideLock(');
    expect(patch).toContain(
      '+    std::lock_guard<std::mutex> lock(mutex_);\n' +
        '     return getMapIterator(key, std::move(generator))->second->second;',
    );
    expect(patch).not.toContain('textlayoutmanager/platform/android/');
    expect(patch).not.toContain('RCTTextLayoutManager.mm');
  });

  test('compiles React Native from source on iOS so the cache patch takes effect', () => {
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
