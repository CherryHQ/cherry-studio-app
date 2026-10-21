import { useStartupReadyAfterFrames } from '@/frontend/appShell/startup';
import i18n from '@/frontend/i18n';

import { RecoveryScreen } from './RecoveryScreen';

// Bootstrap initializes translations after a failure, but that can fail too.
// English is the catalog's source language.
const FALLBACK_COPY = {
  'common.retry': 'Retry',
  'recovery.startupFailed.description':
    'Something stopped the app from starting. Try again. If this keeps happening, close Cherry Studio completely and reopen it.',
  'recovery.startupFailed.title': "Cherry Studio couldn't start",
  'enterprise.startupFailed.description':
    'The first visit needs a connection to load your organization’s configuration. Check your network and try again, or use local data for now.',
  'enterprise.startupFailed.title': "Couldn't reach your organization",
  'enterprise.account.useLocal': 'Use local data',
} as const;

function translate(key: keyof typeof FALLBACK_COPY) {
  return i18n.isInitialized ? i18n.t(key) : FALLBACK_COPY[key];
}

/** Shown instead of the app when bootstrap fails, so a failed start never becomes a crash loop. */
export function StartupFailureScreen({
  onRetry,
  onUseLocal,
}: {
  onRetry: () => void;
  /** Offered when an enterprise profile could not complete its first sync. */
  onUseLocal?: () => void;
}) {
  // The startup cover waits for content to lay out; this screen is that content.
  const reportReady = useStartupReadyAfterFrames();

  return (
    <RecoveryScreen
      description={translate(
        onUseLocal ? 'enterprise.startupFailed.description' : 'recovery.startupFailed.description',
      )}
      onLayout={reportReady}
      onRetry={onRetry}
      retryLabel={translate('common.retry')}
      secondaryAction={
        onUseLocal && { label: translate('enterprise.account.useLocal'), onPress: onUseLocal }
      }
      title={translate(
        onUseLocal ? 'enterprise.startupFailed.title' : 'recovery.startupFailed.title',
      )}
    />
  );
}
