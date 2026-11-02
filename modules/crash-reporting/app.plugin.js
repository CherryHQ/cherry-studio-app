const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
const policy = require('./reportingPolicy.json');
const services = require('../../src/frontend/appShell/observability/reportingServices.json');

// Only public ingestion configuration belongs in the binary. Never embed SENTRY_AUTH_TOKEN.
module.exports = (config) => {
  const reporting = config.extra?.reporting;
  const isProduction =
    reporting?.environment === 'production' && process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true';
  const enabled = isProduction && services.sentry.enabled && reporting?.services?.sentry === true;
  const metadata = {
    [services.sentry.nativeFlag]: enabled,
    CherryCrashReportingDsn: enabled ? process.env.EXPO_PUBLIC_SENTRY_DSN || '' : '',
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
