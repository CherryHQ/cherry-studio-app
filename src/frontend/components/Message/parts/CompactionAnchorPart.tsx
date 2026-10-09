import { Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { CompactionAnchorData } from '@/shared/data/types/uiParts';

export function CompactionAnchorPart({ data }: { data: CompactionAnchorData }) {
  const { t } = useTranslation();
  const color = useThemeColor('muted-foreground');
  const reducedMotion = useReducedMotion();
  if (data.status === 'skipped') return null;

  const isCompacting = data.status === 'compacting';
  const isInLoop = data.phase === 'in-loop';
  const saved =
    data.preTokens !== undefined &&
    data.postTokens !== undefined &&
    data.preTokens > data.postTokens
      ? data.preTokens - data.postTokens
      : undefined;
  const label = isCompacting
    ? t('chat.compaction.compacting')
    : saved === undefined
      ? t('chat.compaction.compacted_plain')
      : t('chat.compaction.compacted', { count: saved });
  const showLabel = isCompacting || isInLoop || saved !== undefined;

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion={isCompacting ? 'polite' : 'none'}
      accessibilityState={{ busy: isCompacting }}
      className="w-full flex-row items-center gap-2"
    >
      {!isInLoop ? <CompactionRule /> : null}
      {isCompacting && !reducedMotion ? (
        <Spinner className="size-3" color={color} size="sm" />
      ) : isInLoop || !showLabel || isCompacting ? (
        <View className="size-1.5 rounded-full bg-border" />
      ) : null}
      {showLabel ? <Text className="shrink text-xs text-muted-foreground">{label}</Text> : null}
      {!isInLoop ? <CompactionRule /> : null}
    </View>
  );
}

function CompactionRule() {
  const color = useThemeColor('border-subtle');
  return (
    <View className="min-w-6 flex-1">
      <Svg height={1} width="100%">
        <Line stroke={color} strokeDasharray="4 4" x1={0} x2="100%" y1={0.5} y2={0.5} />
      </Svg>
    </View>
  );
}
