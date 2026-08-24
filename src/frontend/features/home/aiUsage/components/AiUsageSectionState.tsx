import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, ContentState, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

type AiUsageSectionStatusProps = {
  isError: boolean;
  isRefreshing: boolean;
  loadingTestID?: string;
  onRetry?: () => void;
  retryTestID?: string;
};

export function AiUsageSectionStatus({
  isError,
  isRefreshing,
  loadingTestID,
  onRetry,
  retryTestID,
}: AiUsageSectionStatusProps) {
  const { t } = useTranslation();

  if (isRefreshing) {
    return <Spinner accessibilityLabel={t('aiUsage.loading')} size="sm" testID={loadingTestID} />;
  }
  if (!isError || !onRetry) return null;

  return (
    <Button
      accessibilityLabel={t('aiUsage.retry')}
      className="rounded-full p-2 active:bg-secondary active:opacity-70"
      hitSlop={6}
      icon={<RefreshCwIcon className="text-destructive" />}
      onPress={onRetry}
      size="xs"
      testID={retryTestID}
      variant="ghost"
    />
  );
}

export function AiUsageSectionError({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID: string;
}) {
  const { t } = useTranslation();

  return (
    <ContentState.Error
      className="min-h-40 px-6"
      primaryAction={{
        children: t('aiUsage.retry'),
        icon: <RefreshCwIcon />,
        onPress: onRetry,
        testID,
      }}
      title={message}
    />
  );
}
