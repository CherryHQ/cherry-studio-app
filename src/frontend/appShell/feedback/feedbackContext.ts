import { AiFailureReasonSchema } from '@/shared/contracts/aiFailure';
import type {
  DiagnosticFeedbackContext,
  DiagnosticFeedbackFeature,
} from '@/shared/contracts/diagnostics';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';

export type FeedbackContextInput = Omit<DiagnosticFeedbackContext, 'entry' | 'capturedAt'>;

export function feedbackTimestamp(value: string | null | undefined): string | undefined {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

const FEATURE_ROUTES: readonly [string, DiagnosticFeedbackFeature][] = [
  ['/settings/provider', 'providers'],
  ['/settings/model', 'providers'],
  ['/settings/device-connections', 'desktop'],
  ['/settings/data', 'backup'],
  ['/agents', 'agents'],
  ['/skills', 'agents'],
  ['/plugins', 'plugins'],
  ['/paintings', 'paintings'],
  ['/drawings', 'paintings'],
  ['/library', 'files'],
  ['/files', 'files'],
  ['/trash', 'files'],
  ['/document-export', 'files'],
  ['/chat-share', 'chat'],
  ['/mermaid-diagram', 'chat'],
  ['/remote', 'chat'],
];

export function feedbackFeatureForRoute(pathname: string): DiagnosticFeedbackFeature {
  if (pathname === '/') return 'chat';
  return (
    FEATURE_ROUTES.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )?.[1] ?? 'other'
  );
}

/** Project failure facts only, even when the caller holds a complete provider error. */
export function feedbackFailureContext(data: {
  code?: unknown;
  reasonCode?: unknown;
  context?: unknown;
  source?: unknown;
}): Pick<DiagnosticFeedbackContext, 'error' | 'providerId' | 'modelId'> {
  const context = record(data.context);
  const source = record(data.source);
  const reason = AiFailureReasonSchema.safeParse(data.reasonCode);
  const status = context?.statusCode;
  return {
    providerId: diagnosticIdentifier(context?.providerId),
    modelId: diagnosticIdentifier(context?.modelId),
    error: {
      code: diagnosticIdentifier(data.code),
      sourceCode: diagnosticIdentifier(source?.code),
      reason: reason.success ? reason.data : undefined,
      statusCode:
        typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
          ? status
          : undefined,
    },
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
