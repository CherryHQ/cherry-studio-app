const services = require('../../src/frontend/appShell/observability/reportingServices.json');

// Run after the build/update environment is loaded, not during EAS project discovery.
module.exports = (config) => {
  const reporting = config.extra?.reporting;
  const enabled =
    reporting?.environment === 'production' &&
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true' &&
    services.sentry.enabled &&
    reporting?.services?.sentry === true;
  const dsn = enabled ? process.env.EXPO_PUBLIC_SENTRY_DSN || '' : '';
  if (enabled && !dsn.trim()) {
    throw new Error(
      'EXPO_PUBLIC_SENTRY_DSN is required when production Sentry reporting is enabled. ' +
        'Set it in the build or update environment before publishing.',
    );
  }
  return { enabled, dsn };
};
