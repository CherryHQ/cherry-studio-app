import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, Spinner } from '@cherrystudio/ui/components';
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
      hitSlop={6}
      icon={<RefreshCwIcon className="text-error" />}
      onPress={onRetry}
      shape="pill"
      size="sm"
      testID={retryTestID}
      variant="ghost"
    />
  );
}
