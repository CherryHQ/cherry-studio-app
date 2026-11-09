import { BottomSheet } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { AiUsageDetailRow } from '@/frontend/components/AiUsageDetail';
import { usePreference } from '@/frontend/data/hooks';
import { useAgentContextStatus } from '@/frontend/features/chat/runtime';

import { deriveContextUsage, formatContextUsagePercent } from '../utils/contextUsage';

type ContextUsageDerived = NonNullable<ReturnType<typeof deriveContextUsage>>;

export function ContextUsageDetail({
  open,
  onClose,
  usage,
  sessionId,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  usage: ContextUsageDerived;
  sessionId?: string;
  testID: string;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [showRate] = usePreference('chat.cache_hit_rate.enabled');
  const status = useAgentContextStatus(sessionId);
  const numbers = new Intl.NumberFormat(language);
  const format = (value?: number) =>
    value === undefined ? t('chat.messageUsage.unavailable') : numbers.format(value);
  return (
    <BottomSheet
      open={open}
      closeAction={{ accessibilityLabel: t('common.close') }}
      onClose={onClose}
      title={t('chat.contextUsage.title')}
      testID={testID}
      size="large"
    >
      <ScrollView>
        <View className="gap-4 px-5 pb-6">
          <AiUsageDetailRow label={t('chat.contextUsage.used')} value={format(usage.used)} />
          <AiUsageDetailRow
            label={t('chat.contextUsage.capacity')}
            value={format(usage.capacity)}
          />
          <AiUsageDetailRow
            label={t('chat.contextUsage.remaining')}
            value={format(usage.remaining)}
          />
          {usage.used !== undefined && usage.used > usage.capacity ? (
            <Text className="text-sm text-error">{t('chat.contextUsage.overCapacity')}</Text>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            {t('chat.contextUsage.measurementHint')}
          </Text>
          <Text className="font-medium text-foreground">{t('chat.contextUsage.cacheTitle')}</Text>
          <Text className="text-sm text-muted-foreground">{t('chat.contextUsage.cacheHint')}</Text>
          <AiUsageDetailRow
            label={t('chat.messageUsage.noCache')}
            value={format(usage.cache?.noCacheTokens)}
          />
          <AiUsageDetailRow
            label={t('chat.messageUsage.cacheRead')}
            value={format(usage.cache?.cacheReadTokens)}
          />
          <AiUsageDetailRow
            label={t('chat.messageUsage.cacheWrite')}
            value={format(usage.cache?.cacheWriteTokens)}
          />
          {showRate ? (
            <View testID="chat-context-usage-cache-hit-rate" className="gap-2">
              <AiUsageDetailRow
                label={t('chat.contextUsage.cacheHitRate')}
                value={
                  usage.cacheHitRate === undefined
                    ? t('chat.messageUsage.unavailable')
                    : formatContextUsagePercent(usage.cacheHitRate, language)
                }
              />
              <Text className="text-sm text-muted-foreground">
                {t('chat.contextUsage.cacheRateHint')}
              </Text>
            </View>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            {t('chat.contextUsage.compactionHint')}
          </Text>
          {status ? (
            <Text className="text-sm text-foreground">
              {t(status === 'compacting' ? 'chat.compaction.compacting' : 'chat.compaction.failed')}
            </Text>
          ) : null}
          {usage.used === undefined ? (
            <Text className="text-sm text-muted-foreground">
              {t('chat.contextUsage.unavailable')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
