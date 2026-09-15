import type { ConfigContext, ExpoConfig } from 'expo/config';

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
  const gmailIosClientId = process.env.GMAIL_IOS_CLIENT_ID?.trim();
  const gmailIosBundleIdentifier = process.env.GMAIL_IOS_BUNDLE_IDENTIFIER?.trim();
  if (gmailIosClientId || gmailIosBundleIdentifier) {
    if (
      !gmailIosClientId ||
      !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(gmailIosClientId) ||
      gmailIosBundleIdentifier !== bundleIdentifier
    ) {
      throw new Error(
        `Set GMAIL_IOS_CLIENT_ID and GMAIL_IOS_BUNDLE_IDENTIFIER for ${bundleIdentifier}.`,
      );
    }
  }

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
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(gmailIosClientId
          ? {
              GIDClientID: gmailIosClientId,
              CFBundleURLTypes: [
                ...(config.ios?.infoPlist?.CFBundleURLTypes ?? []),
                {
                  CFBundleURLSchemes: [gmailIosClientId.split('.').toReversed().join('.')],
                },
              ],
            }
          : {}),
      },
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.security.application-groups': [groupIdentifier],
      },
    },
    android: { ...config.android, package: `${config.android!.package}${suffix}` },
    plugins: config.plugins
      ?.filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== '@sentry/react-native/expo' || profile === 'production';
      })
      .map((plugin) => {
        if (plugin === 'expo-dev-client') {
          return [plugin, { addGeneratedScheme: profile === 'development' }];
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
