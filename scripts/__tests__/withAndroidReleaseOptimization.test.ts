type NativeConfig = {
  extra: { reporting: { services: { sentry: boolean } } };
  gradle: { contents: string; language: string };
};

jest.mock('expo/config-plugins', () => ({
  withAppBuildGradle: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['gradle'] }) => unknown,
  ) => {
    action({ modResults: config.gradle });
    return config;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Match Expo's config-plugin loader.
const plugin = require('../withAndroidReleaseOptimization') as (
  config: NativeConfig,
) => NativeConfig;

function nativeConfig(sentry = true): NativeConfig {
  return {
    extra: { reporting: { services: { sentry } } },
    gradle: {
      language: 'groovy',
      contents: [
        ...(sentry ? ['apply plugin: "io.sentry.android.gradle"'] : []),
        'apply plugin: "com.android.application"',
        'apply plugin: "org.jetbrains.kotlin.android"',
        'proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"',
        ...(sentry ? ['sentry {', '    includeNativeSources = true', '}'] : []),
        '',
      ].join('\n'),
    },
  };
}

test('applies Sentry after the application plugin while retaining optimization and source coverage', () => {
  const config = plugin(nativeConfig());
  expect(config.gradle.contents).toContain(
    'apply plugin: "com.android.application"\napply plugin: "io.sentry.android.gradle"',
  );
  expect(config.gradle.contents).toContain('proguard-android-optimize.txt');
  expect(config.gradle.contents).toContain('includeNativeSources = true');
  expect(config.gradle.contents).toContain('additionalSourceDirsForSourceContext');
  const first = config.gradle.contents;
  expect(plugin(config).gradle.contents).toBe(first);
});

test('keeps Sentry disabled when reporting is disabled', () => {
  const config = plugin(nativeConfig(false));
  expect(config.gradle.contents).toContain('proguard-android-optimize.txt');
  expect(config.gradle.contents).not.toContain('sentry');
  expect(config.gradle.contents).not.toContain('additionalSourceDirsForSourceContext');
});

test.each(['com.android.application', 'io.sentry.android.gradle'])(
  'fails explicitly when the generated %s plugin declaration is missing',
  (name) => {
    const config = nativeConfig();
    config.gradle.contents = config.gradle.contents.replace(`apply plugin: "${name}"\n`, '');
    expect(() => plugin(config)).toThrow('requires the application and Sentry plugins');
  },
);
