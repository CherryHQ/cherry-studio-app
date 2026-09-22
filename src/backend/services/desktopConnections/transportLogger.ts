import type { ComponentLogger, Logger } from '@libp2p/interface';
import { loggerService } from '@logger';

const logger = loggerService.withContext('RemoteTransport');

/** libp2p wants its own logger shape; only failures are worth surfacing, never record data. */
const silent = (): Logger =>
  Object.assign(() => {}, {
    enabled: false,
    trace() {},
    error: () => logger.debug('Encrypted remote transport reported a failure'),
    newScope: silent,
  });

export const transportLogger: ComponentLogger = { forComponent: silent };
