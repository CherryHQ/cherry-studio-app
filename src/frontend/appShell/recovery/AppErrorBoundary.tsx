import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorBoundary } from '@/frontend/components/ErrorBoundary';

import { RecoveryScreen } from './RecoveryScreen';

/** Replaces the app tree with a recoverable screen when any part of it fails to render. */
export function AppErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary fallback={renderFailure} operation="app.render">
      {children}
    </ErrorBoundary>
  );
}

function renderFailure(reset: () => void) {
  return <RenderFailureScreen onRetry={reset} />;
}

function RenderFailureScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <RecoveryScreen
      description={t('recovery.renderFailed.description')}
      onRetry={onRetry}
      retryLabel={t('common.retry')}
      title={t('recovery.renderFailed.title')}
    />
  );
}
