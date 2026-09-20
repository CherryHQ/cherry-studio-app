import 'tsx/cjs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import reportingServices from './src/frontend/appShell/observability/reportingServices.json';
import { APP_LANGUAGES } from './src/shared/utils/languages';

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.PROFILE ?? 'production';
  if (!['development', 'preview', 'production'].includes(profile)) {
    throw new Error(`Unknown PROFILE: ${profile}. Expected development, preview, or production.`);
  }

  const suffix = profile === 'development' ? '.dev' : profile === 'preview' ? '.preview' : '';
  const bundleIdentifier = `${config.ios!.bundleIdentifier}${suffix}`;
  const groupIdentifier = `group.${bundleIdentifier}`;
  const widgetBundleIdentifier = `${bundleIdentifier}.ExpoWidgetsTarget`;
  const eas = config.extra?.eas;
  const reporting = {
    environment: profile,
    services: Object.fromEntries(
      Object.entries(reportingServices).map(([name, service]) => [
        name,
        profile === 'production' &&
          process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true' &&
          service.enabled,
      ]),
    ),
  };

  return {
    ...config,
    name:
      profile === 'development'
        ? `${config.name} Dev`
        : profile === 'preview'
          ? `${config.name} Preview`
          : config.name!,
    slug: config.slug!,
    scheme: `cherrystudio${suffix.replace('.', '-')}`,
    ios: {
      ...config.ios,
      buildNumber: process.env.EAS_BUILD_IOS_BUILD_NUMBER ?? config.ios?.buildNumber,
      bundleIdentifier,
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.security.application-groups': [groupIdentifier],
      },
    },
    android: { ...config.android, package: `${config.android!.package}${suffix}` },
    plugins: [
      ...(config.plugins ?? []),
      './modules/crash-reporting/app.plugin.js',
      './scripts/withReportingAutolinking.js',
    ]
      .filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== '@sentry/react-native/expo' || reporting.services.sentry;
      })
      .map((plugin) => {
        if (plugin === 'expo-dev-client') {
          return [plugin, { addGeneratedScheme: profile === 'development' }];
        }
        if (plugin === 'expo-localization') {
          return [plugin, { supportedLocales: APP_LANGUAGES.map(({ value }) => value) }];
        }
        if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
          return [
            plugin[0],
            { ...plugin[1], bundleIdentifier: widgetBundleIdentifier, groupIdentifier },
          ];
        }
        return plugin;
      }),
    extra: {
      ...config.extra,
      sentryEnvironment: profile,
      reporting,
      eas: {
        ...eas,
        build: {
          ...eas?.build,
          experimental: {
            ...eas?.build?.experimental,
            ios: {
              ...eas?.build?.experimental?.ios,
              appExtensions: [
                {
                  targetName: 'ExpoWidgetsTarget',
                  bundleIdentifier: widgetBundleIdentifier,
                  entitlements: { 'com.apple.security.application-groups': [groupIdentifier] },
                },
              ],
            },
          },
        },
      },
    },
  };
};
