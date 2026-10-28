import ImageOffIcon from '@cherrystudio/app-icons/icons/image-off';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import { Button } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AiFailureDetailSheet, aiFailureReasonTitleKey } from '@/frontend/components/AiFailure';
import type { AiFailureSnapshot } from '@/shared/contracts/aiFailure';
import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

/** A stopped image keeps its canvas, which names the failure and brief; recovery sits below. */
export function PaintingGenerationFailure({
  failure,
  height,
  message,
  onRetry,
  onReport,
  prompt,
  status,
  width,
}: {
  failure?: AiFailureSnapshot;
  height: number;
  message?: string;
  onRetry?: () => Promise<void>;
  onReport: () => void;
  prompt: string | undefined;
  status: 'failed' | 'interrupted';
  width: number;
}) {
  const { t } = useTranslation();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const reasonCode =
    failure?.reasonCode ?? (message ? classifyAiFailureReason({ message }) : undefined);
  const reasonKey = status === 'failed' ? aiFailureReasonTitleKey(reasonCode) : undefined;
  // A known cause replaces the generic status; `unknown` says nothing more.
  const title = t(
    reasonKey && reasonCode !== 'unknown'
      ? reasonKey
      : status === 'failed'
        ? 'painting.status.failed'
        : 'painting.status.interrupted',
  );

  async function retry() {
    if (!onRetry || retryInFlight.current) return;
    retryInFlight.current = true;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      retryInFlight.current = false;
      setIsRetrying(false);
    }
  }

  return (
    <View className="w-full items-center gap-5" testID="painting-generation-failure">
      <View
        className="items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-border-strong bg-secondary px-10"
        style={{ height, width }}
      >
        <View className="absolute left-4 top-4 size-5 border-l border-t border-border-selected" />
        <View className="absolute right-4 top-4 size-5 border-r border-t border-border-selected" />
        <View className="absolute bottom-4 left-4 size-5 border-b border-l border-border-selected" />
        <View className="absolute bottom-4 right-4 size-5 border-b border-r border-border-selected" />
        <ImageOffIcon className="size-8 text-foreground-tertiary" strokeWidth={1} />
        <View className="items-center gap-1">
          <Text
            accessibilityRole="header"
            className="text-center font-medium text-foreground text-sm"
          >
            {title}
          </Text>
          {prompt ? (
            <Text className="text-center text-muted-foreground text-sm" numberOfLines={3}>
              {prompt}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-center gap-2">
        {onRetry ? (
          <Button
            accessibilityLabel={t('painting.status.retry')}
            disabled={isRetrying}
            icon={<RotateCcwIcon />}
            loading={isRetrying}
            onPress={retry}
            shape="pill"
            size="sm"
            testID="painting-generation-retry"
          >
            <Button.Label>{t('painting.status.retry')}</Button.Label>
          </Button>
        ) : null}
        {status === 'failed' ? (
          <Button
            accessibilityLabel={t('painting.errorDetail.action')}
            icon={<InfoIcon />}
            onPress={() => setIsDetailOpen(true)}
            shape="pill"
            size="sm"
            variant="tonal"
          />
        ) : null}
      </View>
      {isDetailOpen ? (
        <AiFailureDetailSheet
          data={{
            ...failure,
            reasonCode,
            message: message?.trim() ? message : t('painting.errorDetail.unavailable'),
          }}
          onClose={() => setIsDetailOpen(false)}
          onReport={onReport}
          testID="painting-error-detail"
        />
      ) : null}
    </View>
  );
}
