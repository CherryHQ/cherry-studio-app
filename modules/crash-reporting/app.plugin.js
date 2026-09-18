const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
const policy = require('./reportingPolicy.json');

// Only public ingestion configuration belongs in the binary. Never embed SENTRY_AUTH_TOKEN.
module.exports = (config) => {
  const enabled =
    config.extra?.sentryEnvironment === 'production' &&
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true';
  const metadata = {
    CherryCrashReportingDsn: enabled ? process.env.EXPO_PUBLIC_SENTRY_DSN || '' : '',
    CherryCrashReportingEnabled: enabled,
    CherryCrashReportingConsentVersion: policy.consentVersion,
    CherryCrashReportingBreadcrumbs: policy.breadcrumbCodes.join('|'),
    CherryCrashReportingMaxBreadcrumbs: policy.maxBreadcrumbs,
  };
  config = withInfoPlist(config, (mod) => {
    Object.assign(mod.modResults, metadata);
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    for (const [name, value] of Object.entries(metadata)) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, name, String(value));
    }
    return mod;
  });
};
