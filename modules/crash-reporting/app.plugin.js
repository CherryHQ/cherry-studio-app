const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
const getCrashReportingBuildConfig = require('./buildConfig');
const policy = require('./reportingPolicy.json');
const services = require('../../src/frontend/appShell/observability/reportingServices.json');

// Only public ingestion configuration belongs in the binary. Never embed SENTRY_AUTH_TOKEN.
module.exports = (config) => {
  // EAS reads app config before fetching its environment; validate only when generating native files.
  const metadata = () => {
    const { enabled, dsn } = getCrashReportingBuildConfig(config);
    return {
      [services.sentry.nativeFlag]: enabled,
      CherryCrashReportingDsn: dsn,
      CherryCrashReportingConsentVersion: policy.consentVersion,
      CherryCrashReportingBreadcrumbs: policy.breadcrumbCodes.join('|'),
      CherryCrashReportingMaxBreadcrumbs: policy.maxBreadcrumbs,
    };
  };
  config = withInfoPlist(config, (mod) => {
    Object.assign(mod.modResults, metadata());
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    for (const [name, value] of Object.entries(metadata())) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, name, String(value));
    }
    return mod;
  });
};
