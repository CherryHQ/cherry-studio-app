import { loggerService } from '@logger';

import { configureSentry } from './configureSentry';

const logger = loggerService.withContext('Reporting');
type ObserveAdapter = typeof import('./configureObserve');

// Startup order is fixed: Sentry before Router, Observe before screens. Insights starts natively.
export function configureReporting(phase: 'entry' | 'layout'): void {
  const onError = () => logger.warn(`Could not configure ${phase} reporting`);
  try {
    if (phase === 'entry') {
      void configureSentry().catch(onError);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep Router out of entry
      const { configureObserve } = require('./configureObserve') as ObserveAdapter;
      configureObserve();
    }
  } catch {
    // Reporting must not interrupt application startup.
    onError();
  }
}
