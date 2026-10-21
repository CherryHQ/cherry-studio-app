import 'tsx/cjs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import reportingServices from './src/frontend/appShell/observability/reportingServices.json';
import { APP_LANGUAGES } from './src/shared/utils/languages';

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.PROFILE ?? 'production';
  if (!['development', 'preview', 'production'].includes(profile)) {
    throw new Error(`Unknown PROFILE: ${profile}. Expected development, preview, or production.`);
  }
  const apkUpdatesSetting = process.env.APK_UPDATES_ENABLED ?? 'false';
  if (!['true', 'false'].includes(apkUpdatesSetting)) {
    throw new Error(`Invalid APK_UPDATES_ENABLED: ${apkUpdatesSetting}. Expected true or false.`);
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
    updates: {
      ...config.updates,
      enabled: profile !== 'development' && process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true',
    },
    ios: {
      ...config.ios,
      buildNumber: process.env.EAS_BUILD_IOS_BUILD_NUMBER ?? config.ios?.buildNumber,
      bundleIdentifier,
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.security.application-groups': [
          groupIdentifier,
          `group.${bundleIdentifier}.system-integration`,
        ],
      },
    },
    android: { ...config.android, package: `${config.android!.package}${suffix}` },
    plugins: [
      ...(profile === 'production' ? ['./scripts/withAndroidReleaseOptimization.js'] : []),
      ...(config.plugins ?? []),
      '@preeternal/react-native-file-hash',
      './plugins/withDiagnostics',
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
        if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
          return [
            plugin[0],
            {
              ...plugin[1],
              android: {
                ...plugin[1].android,
                enableMinifyInReleaseBuilds: profile === 'production',
                enableShrinkResourcesInReleaseBuilds: profile === 'production',
                // Compressed native libraries only help direct APK downloads; the Google Play profile opts out.
                useLegacyPackaging:
                  profile !== 'development' && process.env.ANDROID_COMPRESS_NATIVE_LIBS !== 'false',
              },
            },
          ];
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
      // Public Accounts Portal inputs. Non-production builds default to the cn-dev staging
      // deployment; production must supply every value explicitly.
      accountsPortal: {
        origin:
          process.env.ACCOUNTS_PORTAL_ORIGIN ??
          (profile === 'production' ? '' : 'https://accounts-portal-staging.cherry-ai.com'),
        issuer:
          process.env.ACCOUNTS_PORTAL_ISSUER ??
          (profile === 'production' ? '' : 'https://auth-cn-dev.cherry-ai.com'),
        clientId:
          process.env.ACCOUNTS_PORTAL_CLIENT_ID ??
          (profile === 'production' ? '' : '395913266875862394'),
        scopes: (
          process.env.ACCOUNTS_PORTAL_SCOPES ??
          (profile === 'production' ? '' : 'urn:zitadel:iam:org:project:id:382618228913868810:aud')
        )
          .split(/\s+/)
          .filter(Boolean),
        enterpriseAddress:
          process.env.ACCOUNTS_PORTAL_ENTERPRISE_API ??
          (profile === 'production' ? '' : 'https://cse-api-staging.cherry-ai.com'),
      },
      // Packaged builds gate on the native `production-apk` channel; only development reads the flag.
      // Keeping it out of packaged configs keeps it out of their runtime fingerprints.
      isApkUpdatesEnabled: profile === 'development' && apkUpdatesSetting === 'true',
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
                {
                  targetName: 'CherryShareExtension',
                  bundleIdentifier: `${bundleIdentifier}.CherryShareExtension`,
                  entitlements: {
                    'com.apple.security.application-groups': [
                      `group.${bundleIdentifier}.system-integration`,
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
};
