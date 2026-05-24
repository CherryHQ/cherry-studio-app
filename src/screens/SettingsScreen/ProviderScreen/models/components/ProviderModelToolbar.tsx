import { ActivityIcon, DownloadIcon, PlusIcon } from 'lucide-uniwind';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

const StyledPressable = withUniwind(Pressable);

export function ProviderModelToolbar() {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between gap-3 px-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.models.title')}
      </Text>
      <View className="flex-row items-center gap-2">
        <ModelIconActionButton
          accessibilityLabel={t('settings.provider.models.activity')}
          icon={<ActivityIcon className="size-4 text-default-foreground" strokeWidth={2} />}
        />
        <ModelActionButton
          accessibilityLabel={t('settings.provider.models.pull')}
          icon={<DownloadIcon className="size-4 text-default-foreground" strokeWidth={2} />}
          label={t('settings.provider.models.pull')}
        />
        <ModelActionButton
          accessibilityLabel={t('settings.provider.models.add')}
          icon={<PlusIcon className="size-4 text-default-foreground" strokeWidth={2} />}
          label={t('settings.provider.models.add')}
        />
      </View>
    </View>
  );
}

function ModelIconActionButton({
  accessibilityLabel,
  icon,
}: {
  accessibilityLabel: string;
  icon: ReactNode;
}) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-7 items-center justify-center active:opacity-60"
      hitSlop={6}
    >
      {icon}
    </StyledPressable>
  );
}

function ModelActionButton({
  accessibilityLabel,
  icon,
  label,
}: {
  accessibilityLabel: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-7 flex-row items-center gap-1 rounded-xl bg-surface-secondary px-2 active:opacity-60"
      hitSlop={6}
    >
      {icon}
      <Text className="font-medium text-default-foreground text-sm">{label}</Text>
    </StyledPressable>
  );
}
