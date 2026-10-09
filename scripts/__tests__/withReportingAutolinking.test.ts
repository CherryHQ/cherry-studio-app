type NativeConfig = {
  extra: { reporting?: { environment: string; services: Record<string, boolean> } };
  podfile: { contents: string };
  settings: { contents: string; language: string };
};

jest.mock('expo/config-plugins', () => ({
  withPodfile: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['podfile'] }) => unknown,
  ) => {
    action({ modResults: config.podfile });
    return config;
  },
  withSettingsGradle: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['settings'] }) => unknown,
  ) => {
    action({ modResults: config.settings });
    return config;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- match Expo's plugin loader
const plugin = require('../withReportingAutolinking') as (config: NativeConfig) => NativeConfig;

function nativeConfig(environment = 'production'): NativeConfig {
  return {
    extra: {
      reporting: { environment, services: { sentry: true, observe: true, insights: true } },
    },
    podfile: { contents: "target 'Cherry' do\n  use_expo_modules!\nend\n" },
    settings: {
      contents:
        "expoAutolinking.exclude = ['unrelated-module']\nexpoAutolinking.useExpoModules()\n",
      language: 'groovy',
    },
  };
}

const oldStorybook = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
beforeEach(() => {
  delete process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
});
afterEach(() => {
  if (oldStorybook === undefined) delete process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
  else process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = oldStorybook;
});

function expectExclusions(config: NativeConfig, packages: string[]) {
  if (packages.length) {
    expect(config.podfile.contents).toContain(
      `use_expo_modules!(exclude: ${JSON.stringify(packages)})`,
    );
    expect(config.settings.contents).toContain(
      `expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ${JSON.stringify(packages)}`,
    );
  } else {
    expect(config.podfile.contents).toContain('  use_expo_modules!\n');
    expect(config.settings.contents).not.toContain('cherry-reporting');
  }
  expect(config.settings.contents).toContain("expoAutolinking.exclude = ['unrelated-module']\n");
}

test.each(['development', 'preview', 'unknown'])(
  '%s excludes both native senders before autolinking',
  (environment) => {
    expectExclusions(plugin(nativeConfig(environment)), ['expo-observe', 'expo-insights']);
  },
);

test('production retains both senders', () => {
  expectExclusions(plugin(nativeConfig()), []);
});

test.each(['observe', 'insights'])('production can exclude only %s', (service) => {
  const config = nativeConfig();
  config.extra.reporting!.services[service] = false;
  expectExclusions(plugin(config), [`expo-${service}`]);
});

test('missing policy and Storybook cannot include native senders', () => {
  const config = nativeConfig();
  delete config.extra.reporting;
  expectExclusions(plugin(config), ['expo-observe', 'expo-insights']);
  process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'true';
  expectExclusions(plugin(nativeConfig()), ['expo-observe', 'expo-insights']);
});

test('repeated prebuilds and profile switches replace only generated exclusions', () => {
  const config = plugin(nativeConfig('development'));
  const original = JSON.stringify(config);
  expect(JSON.stringify(plugin(config))).toBe(original);
  config.extra.reporting!.environment = 'production';
  plugin(config);
  expectExclusions(config, []);
  config.extra.reporting!.environment = 'development';
  expect(JSON.stringify(plugin(config))).toBe(original);
});

test('unsupported native templates fail instead of silently enabling reporting', () => {
  const podfile = nativeConfig('development');
  podfile.podfile.contents = "use_expo_modules!(exclude: ['custom-module'])";
  expect(() => plugin(podfile)).toThrow('managed use_expo_modules!');
  const settings = nativeConfig('development');
  settings.settings.contents = 'useExpoModules()';
  expect(() => plugin(settings)).toThrow('managed expoAutolinking.useExpoModules()');
});
