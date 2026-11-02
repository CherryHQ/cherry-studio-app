import services from '../../../src/frontend/appShell/observability/reportingServices.json';
import policy from '../reportingPolicy.json';

type MetadataEntry = { $: { 'android:name': string; 'android:value': string } };
type NativeConfig = {
  extra: { reporting?: { environment: string; services: Record<string, boolean> } };
  info: Record<string, unknown>;
  application: { 'meta-data': MetadataEntry[] };
  mods?: { ios?: () => unknown; android?: () => unknown };
};

// Exercise the config mods without generating native projects or touching the filesystem.
jest.mock('expo/config-plugins', () => ({
  withInfoPlist: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['info'] }) => unknown,
  ) => {
    config.mods = { ...config.mods, ios: () => action({ modResults: config.info }) };
    return config;
  },
  withAndroidManifest: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['application'] }) => unknown,
  ) => {
    config.mods = { ...config.mods, android: () => action({ modResults: config.application }) };
    return config;
  },
  AndroidConfig: {
    Manifest: {
      getMainApplicationOrThrow: (application: NativeConfig['application']) => application,
      addMetaDataItemToMainApplication: (
        application: NativeConfig['application'],
        name: string,
        value: string,
      ) => {
        application['meta-data'].push({ $: { 'android:name': name, 'android:value': value } });
      },
    },
  },
}));

// Expo loads local config plugins as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- match Expo's plugin loader
const plugin = require('../app.plugin') as (config: NativeConfig) => NativeConfig;

function generateNativeConfig(input: NativeConfig): NativeConfig {
  const config = plugin(input);
  config.mods?.ios?.();
  config.mods?.android?.();
  return config;
}

describe('native startup reporting configuration', () => {
  const oldDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const oldStorybook = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
  const oldToken = process.env.SENTRY_AUTH_TOKEN;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'false';
    process.env.SENTRY_AUTH_TOKEN = 'PRIVATE_BUILD_TOKEN';
  });
  afterEach(() => {
    for (const [key, value] of Object.entries({
      EXPO_PUBLIC_SENTRY_DSN: oldDsn,
      EXPO_PUBLIC_STORYBOOK_ENABLED: oldStorybook,
      SENTRY_AUTH_TOKEN: oldToken,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test.each(['development', 'preview', 'production'])(
    'embeds the same consent policy with a production-only DSN for %s',
    (profile) => {
      const config = generateNativeConfig({
        extra: {
          reporting: {
            environment: profile,
            services: { sentry: true, observe: true, insights: true },
          },
        },
        info: {},
        application: { 'meta-data': [] },
      });
      const android = Object.fromEntries(
        config.application['meta-data'].map(({ $: entry }) => [
          entry['android:name'],
          entry['android:value'],
        ]),
      );
      expect(config.info[services.sentry.nativeFlag]).toBe(profile === 'production');
      expect(config.info.CherryCrashReportingDsn).toBe(
        profile === 'production' ? process.env.EXPO_PUBLIC_SENTRY_DSN : '',
      );
      expect(config.info.CherryCrashReportingConsentVersion).toBe(policy.consentVersion);
      expect(config.info.CherryCrashReportingBreadcrumbs).toBe(policy.breadcrumbCodes.join('|'));
      for (const [key, value] of Object.entries(config.info))
        expect(android[key]).toBe(String(value));
      expect(JSON.stringify(config)).not.toContain('PRIVATE_BUILD_TOKEN');
    },
  );

  test('disables native startup reporting in Storybook even with production config', () => {
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'true';
    const config = generateNativeConfig({
      extra: {
        reporting: {
          environment: 'production',
          services: { sentry: true, observe: true, insights: true },
        },
      },
      info: {},
      application: { 'meta-data': [] },
    });
    expect(config.info[services.sentry.nativeFlag]).toBe(false);
    expect(config.info.CherryCrashReportingDsn).toBe('');
  });

  test.each(Object.keys(services) as (keyof typeof services)[])(
    'the Sentry native flag follows its own service setting: %s',
    (disabled) => {
      const config = generateNativeConfig({
        extra: {
          reporting: {
            environment: 'production',
            services: { sentry: true, observe: true, insights: true, [disabled]: false },
          },
        },
        info: {},
        application: { 'meta-data': [] },
      });
      expect(config.info[services.sentry.nativeFlag]).toBe(disabled !== 'sentry');
    },
  );

  test('missing configuration never enables any native sender', () => {
    const config = generateNativeConfig({ extra: {}, info: {}, application: { 'meta-data': [] } });
    expect(config.info[services.sentry.nativeFlag]).toBe(false);
    expect(config.info.CherryCrashReportingDsn).toBe('');
  });

  test.each([undefined, '', ' \t '])(
    'rejects a missing or blank production DSN during native generation: %j',
    (dsn) => {
      if (dsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      else process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
      // EAS must still be able to discover the project before loading its remote environment.
      const config = plugin({
        extra: { reporting: { environment: 'production', services: { sentry: true } } },
        info: {},
        application: { 'meta-data': [] },
      });
      expect(config.info).toEqual({});
      expect(() => config.mods!.ios!()).toThrow('EXPO_PUBLIC_SENTRY_DSN is required');
      expect(() => config.mods!.android!()).toThrow('EXPO_PUBLIC_SENTRY_DSN is required');
    },
  );

  test('reads the DSN after the build environment is loaded', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const config = plugin({
      extra: { reporting: { environment: 'production', services: { sentry: true } } },
      info: {},
      application: { 'meta-data': [] },
    });
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    config.mods!.ios!();
    config.mods!.android!();
    expect(config.info.CherryCrashReportingDsn).toBe('https://public@example.com/1');
    expect(config.application['meta-data']).toContainEqual({
      $: {
        'android:name': 'CherryCrashReportingDsn',
        'android:value': 'https://public@example.com/1',
      },
    });
  });

  test.each(['development', 'preview', 'storybook', 'disabled'])(
    '%s does not require a DSN',
    (variant) => {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = String(variant === 'storybook');
      const config = generateNativeConfig({
        extra: {
          reporting: {
            environment: ['development', 'preview'].includes(variant) ? variant : 'production',
            services: { sentry: variant !== 'disabled' },
          },
        },
        info: {},
        application: { 'meta-data': [] },
      });
      expect(config.info[services.sentry.nativeFlag]).toBe(false);
      expect(config.info.CherryCrashReportingDsn).toBe('');
    },
  );
});
