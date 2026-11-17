import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  type ContextUsage,
  formatContextCapacity,
  formatContextUsagePercent,
} from '../utils/contextUsage';

export function ContextUsageProgress({ usage }: { usage: ContextUsage }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const percent =
    usage.ratio === undefined
      ? '—'
      : formatContextUsagePercent(usage.ratio, language, usage.estimated);
  return (
    <View className="flex-row items-center gap-2.5">
      <View
        accessibilityRole="progressbar"
        accessibilityValue={
          usage.arcRatio === undefined
            ? { text: t('chat.messageUsage.unavailable') }
            : { min: 0, max: 100, now: usage.arcRatio * 100, text: percent }
        }
        className="h-1.5 min-w-9 flex-1 overflow-hidden rounded-full bg-secondary-active"
        testID="chat-context-usage-progress"
      >
        <View
          className={
            usage.severity === 'error'
              ? 'h-full rounded-full bg-error'
              : usage.severity === 'warning'
                ? 'h-full rounded-full bg-warning'
                : 'h-full rounded-full bg-primary'
          }
          style={{ width: `${(usage.arcRatio ?? 0) * 100}%` }}
        />
      </View>
      <Text className="font-medium text-popover-foreground text-xs tabular-nums">{percent}</Text>
      <Text className="shrink text-muted-foreground text-xs tabular-nums">
        {t('chat.contextUsage.capacityShort', {
          value: formatContextCapacity(usage.capacity, language),
        })}
      </Text>
    </View>
  );
}
