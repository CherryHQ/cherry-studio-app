import { useEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import {
  DiagnosticError,
  type DiagnosticUploadFailureReason,
  type DiagnosticUploadResult,
} from '@/shared/contracts/diagnostics';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { rememberFeedback } from './feedbackHistory';

const logger = loggerService.withContext('DiagnosticBundle');
const FAILURE_KEYS = {
  not_configured: 'settings.about.diagnostics.failures.not_configured',
  invalid_archive: 'settings.about.diagnostics.failures.invalid_archive',
  archive_too_large: 'settings.about.diagnostics.failures.archive_too_large',
  authentication_failed: 'settings.about.diagnostics.failures.authentication_failed',
  rate_limited: 'settings.about.diagnostics.failures.rate_limited',
  service_unavailable: 'settings.about.diagnostics.failures.service_unavailable',
  submission_rejected: 'settings.about.diagnostics.failures.submission_rejected',
} satisfies Record<DiagnosticUploadFailureReason, string>;
const ERROR_KEYS = {
  INSPECT_FAILED: 'settings.about.diagnostics.errors.INSPECT_FAILED',
  BUNDLE_BUILD_FAILED: 'settings.about.diagnostics.errors.BUNDLE_BUILD_FAILED',
  SAVE_FAILED: 'settings.about.diagnostics.errors.SAVE_FAILED',
  NATIVE_UNAVAILABLE: 'settings.about.diagnostics.errors.NATIVE_UNAVAILABLE',
} satisfies Record<DiagnosticError['code'], string>;

type FeedbackState =
  | { status: 'editing' | 'submitting' }
  | { status: 'failed'; messageKey: string }
  | Extract<DiagnosticUploadResult, { status: 'uploaded' | 'submission_unknown' }>;

export function useDiagnosticBundle() {
  const module = useBackendModule('diagnostics');
  const [state, setState] = useState<FeedbackState>({ status: 'editing' });
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(description: string, screenshotId?: string) {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'submitting' });
    try {
      const result = await module.uploadBundle({
        description,
        ...(screenshotId ? { screenshotId } : {}),
        range: '24h',
        includeLogs: true,
        includeTraces: true,
      });
      if (result.status === 'uploaded') {
        try {
          rememberFeedback(result.reportId, description);
        } catch {
          // Local history cannot turn an accepted submission into an upload failure.
          logger.warn('Failed to save feedback history');
        }
      }
      if (!mounted.current) return;
      if (result.status === 'busy') {
        setState({ status: 'failed', messageKey: 'settings.about.diagnostics.errors.busy' });
      } else if (result.status === 'submission_failed') {
        setState({ status: 'failed', messageKey: FAILURE_KEYS[result.reason] });
      } else {
        setState(result);
      }
    } catch (error) {
      logger.error('Feedback submission failed', { error });
      if (mounted.current)
        setState({
          status: 'failed',
          messageKey:
            error instanceof DiagnosticError
              ? ERROR_KEYS[error.code]
              : 'settings.about.diagnostics.errors.operationFailed',
        });
    } finally {
      busy.current = false;
    }
  }

  return {
    state,
    submit,
    edit: () => {
      if (!busy.current) setState({ status: 'editing' });
    },
    close: (onClose: () => void) => {
      if (!busy.current) onClose();
    },
  };
}
