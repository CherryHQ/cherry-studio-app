import {
  traceErrorAttributes,
  type TraceRecorder,
  type TraceSpan,
} from '@/backend/utils/diagnosticTrace';
import { PluginError } from '@/shared/contracts/plugins';

export type PluginDiagnosticStage =
  | 'begin'
  | 'callback'
  | 'confirm'
  | 'application'
  | 'cancel'
  | 'reset_application'
  | 'poll'
  | 'prepare'
  | 'validate'
  | 'commit'
  | 'refresh'
  | 'revoke';

export type RecordPluginOperation = <T>(
  stage: PluginDiagnosticStage,
  action: () => Promise<T>,
) => Promise<T>;
export const withoutPluginDiagnostics: RecordPluginOperation = (_stage, action) => action();

const AUTHORIZATION_STATUSES = new Set([
  'idle',
  'application-ready',
  'waiting',
  'callback',
  'review',
  'expired',
  'denied',
  'unsupported-account',
  'ready',
]);

/** Never inspect credentials, callback URLs, accounts, tool inputs, or response bodies. */
export async function recordPluginOperation<T>(
  traces: TraceRecorder | undefined,
  pluginId: string,
  method: string,
  stage: PluginDiagnosticStage,
  action: () => Promise<T>,
): Promise<T> {
  let span: TraceSpan | undefined;
  try {
    span = traces?.startTrace(`plugin.${stage}`, undefined, {
      'plugin.id': pluginId,
      'plugin.auth.method': method,
      'plugin.stage': stage,
    });
  } catch {
    /* Diagnostics must not affect authorization. */
  }
  try {
    const result = await action();
    try {
      const status =
        result &&
        typeof result === 'object' &&
        'status' in result &&
        typeof result.status === 'string' &&
        AUTHORIZATION_STATUSES.has(result.status)
          ? result.status
          : undefined;
      span?.end(
        status && ['expired', 'denied', 'unsupported-account'].includes(status) ? 'error' : 'ok',
        {
          'plugin.state': status,
        },
      );
    } catch {
      /* Best effort. */
    }
    return result;
  } catch (error) {
    try {
      const cancelled =
        (error instanceof PluginError && error.reason === 'cancelled') ||
        (error instanceof Error && error.name === 'AbortError');
      span?.end(cancelled ? 'cancelled' : 'error', traceErrorAttributes(error));
    } catch {
      /* Preserve the original failure. */
    }
    throw error;
  }
}
