import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AiFailureMessage } from '@/frontend/components/AiFailure';
import type { AiFailureSnapshot } from '@/shared/contracts/aiFailure';
import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

export function PaintingErrorMessage({
  message,
  failure,
  onRetry,
}: {
  message?: string;
  failure?: AiFailureSnapshot;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="w-full gap-2">
      <AiFailureMessage
        data={{
          ...failure,
          reasonCode:
            failure?.reasonCode ?? (message ? classifyAiFailureReason({ message }) : undefined),
          message: message?.trim() ? message : t('painting.errorDetail.unavailable'),
        }}
        message={t('painting.status.failedHint')}
        testID="painting-error-detail"
        title={t('painting.status.failed')}
      />
      {onRetry ? (
        <View className="items-start">
          <Button
            accessibilityLabel={t('painting.status.retry')}
            onPress={onRetry}
            size="sm"
            variant="secondary"
          >
            <Button.Label>{t('painting.status.retry')}</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
