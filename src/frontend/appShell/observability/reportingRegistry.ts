import { loggerService } from '@logger';

import { configureSentry } from './configureSentry';
import services from './reportingServices.json';

const logger = loggerService.withContext('Reporting');
type ObserveAdapter = typeof import('./configureObserve');

// Insights starts natively when included by the build policy; it has no JS initializer.
const initializers = {
  sentry: configureSentry,
  observe: () => {
    // Keep Router/React imports out of the early error-capture entry point.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- layout-only initialization
    const observe = require('./configureObserve') as ObserveAdapter;
    observe.configureObserve();
  },
};

export function configureReporting(phase: 'entry' | 'layout'): void {
  for (const service of Object.keys(initializers) as (keyof typeof initializers)[]) {
    if (services[service].phase !== phase) continue;
    // Disabled adapters still reconcile consent or close a previously enabled dispatch gate.
    try {
      const result = initializers[service]();
      if (result) void result.catch(() => logger.warn(`Could not configure ${service}`));
    } catch {
      // Reporting must not prevent application startup or initialize another reporter recursively.
      logger.warn(`Could not configure ${service}`);
    }
  }
}
