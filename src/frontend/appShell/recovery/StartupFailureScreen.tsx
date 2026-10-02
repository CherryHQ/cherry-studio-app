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
} as const;

function translate(key: keyof typeof FALLBACK_COPY) {
  return i18n.isInitialized ? i18n.t(key) : FALLBACK_COPY[key];
}

/** Shown instead of the app when bootstrap fails, so a failed start never becomes a crash loop. */
export function StartupFailureScreen({ onRetry }: { onRetry: () => void }) {
  // The startup cover waits for content to lay out; this screen is that content.
  const reportReady = useStartupReadyAfterFrames();

  return (
    <RecoveryScreen
      description={translate('recovery.startupFailed.description')}
      onLayout={reportReady}
      onRetry={onRetry}
      retryLabel={translate('common.retry')}
      title={translate('recovery.startupFailed.title')}
    />
  );
}
