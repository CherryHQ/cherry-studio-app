import { RefreshCwIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type AiUsageSectionStatusProps = {
  isError: boolean;
  isRefreshing: boolean;
  onRetry?: () => void;
  retryTestID?: string;
};

export function AiUsageSectionStatus({
  isError,
  isRefreshing,
  onRetry,
  retryTestID,
}: AiUsageSectionStatusProps) {
  const { t } = useTranslation();

  if (isRefreshing) {
    return <ActivityIndicator accessibilityLabel={t('aiUsage.loading')} size="small" />;
  }
  if (!isError || !onRetry) return null;

  return (
    <Pressable
      accessibilityLabel={t('aiUsage.retry')}
      accessibilityRole="button"
      className="size-8 items-center justify-center rounded-full active:bg-secondary active:opacity-70"
      hitSlop={6}
      style={styles.continuousCorners}
      testID={retryTestID}
      onPress={onRetry}
    >
      <RefreshCwIcon className="size-4 text-destructive" strokeWidth={2} />
    </Pressable>
  );
}

export function AiUsageSectionAction({
  label,
  onPress,
  testID,
  variant,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  variant: 'compact' | 'default';
}) {
  const isCompact = variant === 'compact';

  return (
    <Pressable
      accessibilityRole="button"
      className={
        isCompact
          ? 'shrink-0 rounded-lg px-2 active:bg-secondary active:opacity-70'
          : 'shrink-0 rounded-lg px-2 py-1.5 active:bg-secondary active:opacity-70'
      }
      hitSlop={isCompact ? 10 : 4}
      style={styles.continuousCorners}
      testID={testID}
      onPress={onPress}
    >
      <Text className="font-medium text-primary text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
    <View className="min-h-40 items-center justify-center gap-4 px-6">
      <Text selectable className="text-center text-destructive-foreground text-sm">
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-lg bg-secondary px-4 py-2 active:opacity-70"
        style={styles.continuousCorners}
        testID={testID}
        onPress={onRetry}
      >
        <RefreshCwIcon className="size-4 text-foreground" strokeWidth={2} />
        <Text className="font-medium text-foreground text-sm">{t('aiUsage.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  continuousCorners: {
    borderCurve: 'continuous',
  },
});
