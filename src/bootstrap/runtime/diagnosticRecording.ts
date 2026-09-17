import { AppState } from 'react-native';

import { removeLegacyDiagnosticData } from '@/backend/services/diagnostics/diagnosticFiles';
import { createDiagnosticLogWriter } from '@/backend/services/diagnostics/diagnosticRecording';
import {
  flushLogWriter,
  installLogWriter,
  loggerService,
} from '@/shared/core/logger/LoggerService';

type RejectionOptions = {
  allRejections: boolean;
  onUnhandled(id: number, error: unknown): void;
  onHandled(id: number): void;
};
type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type RuntimeGlobals = {
  ErrorUtils?: { getGlobalHandler(): ErrorHandler; setGlobalHandler(handler: ErrorHandler): void };
  HermesInternal?: { enablePromiseRejectionTracker?(options: RejectionOptions): void };
};

// Installed once from the app entry, ahead of router imports and database boot.
// A process-level log sink must also survive a failed/replaced ApplicationHost.
const logger = loggerService.withContext('CrashTelemetry');
try {
  removeLegacyDiagnosticData();
} catch {
  // Old source paths are never read by the metadata collector. Retry cleanup next launch.
}
try {
  installLogWriter(createDiagnosticLogWriter());
  // This observer has the same app-entry process lifetime as the installed writer.
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') flushLogWriter();
  });
} catch (error) {
  // Unavailable file storage must not turn diagnostic setup into a boot failure.
  logger.warn('Diagnostic file logging unavailable', { error });
}
const runtime = globalThis as typeof globalThis & RuntimeGlobals;
const previousHandler = runtime.ErrorUtils?.getGlobalHandler();
if (previousHandler) {
  runtime.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    logger.error('Uncaught JavaScript exception', error, { isFatal });
    previousHandler(error, isFatal);
  });
}

// Preserve RN's development reporting and handled-rejection behavior. Release
// Hermes has no tracker by default; recording adds one without changing throws.
if (runtime.HermesInternal?.enablePromiseRejectionTracker) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- RN exposes these runtime callbacks only from this internal module.
  const defaults = require('react-native/Libraries/promiseRejectionTrackingOptions')
    .default as RejectionOptions;
  runtime.HermesInternal.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (id, error) => {
      logger.error('Unhandled promise rejection', { id, error });
      if (__DEV__) defaults.onUnhandled(id, error);
    },
    onHandled: (id) => {
      logger.warn('Promise rejection handled', { id });
      if (__DEV__) defaults.onHandled(id);
    },
  });
}
