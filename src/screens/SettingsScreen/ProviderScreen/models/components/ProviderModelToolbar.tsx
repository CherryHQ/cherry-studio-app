import { useThemeColor } from 'heroui-native/hooks';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { ActivityIcon, DownloadIcon, PlusIcon } from 'lucide-uniwind/png';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

export type ProviderModelToolbarActionState = {
  isDisabled?: boolean;
  isLoading?: boolean;
  onPress?: () => void;
};

export type ProviderModelToolbarActions = {
  add?: ProviderModelToolbarActionState;
  check?: ProviderModelToolbarActionState;
  pull?: ProviderModelToolbarActionState;
};

type ToolbarActionIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

const toolbarActionDefs: readonly {
  icon: ToolbarActionIcon;
  key: keyof ProviderModelToolbarActions;
  labelKey: string;
  showLabel: boolean;
}[] = [
  {
    icon: ActivityIcon,
    key: 'check',
    labelKey: 'settings.provider.models.check',
    showLabel: false,
  },
  { icon: DownloadIcon, key: 'pull', labelKey: 'settings.provider.models.pull', showLabel: true },
  { icon: PlusIcon, key: 'add', labelKey: 'settings.provider.models.add', showLabel: true },
];

export function ProviderModelToolbar({ actions }: { actions: ProviderModelToolbarActions }) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between gap-3 px-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.models.title')}
      </Text>
      <View className="flex-row items-center gap-2">
        {toolbarActionDefs.map((actionDef) => {
          const label = t(actionDef.labelKey);
          const state = actions[actionDef.key];

          return (
            <ModelActionButton
              key={actionDef.key}
              accessibilityLabel={label}
              icon={actionDef.icon}
              isDisabled={state?.isDisabled ?? false}
              isLoading={state?.isLoading ?? false}
              label={actionDef.showLabel ? label : undefined}
              onPress={state?.onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function ModelActionButton({
  accessibilityLabel,
  icon: Icon,
  isDisabled = false,
  isLoading = false,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  icon: ToolbarActionIcon;
  isDisabled?: boolean;
  isLoading?: boolean;
  label?: string;
  onPress?: () => void;
}) {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, disabled: isDisabled }}
      className={cn(
        'h-7 items-center rounded-xl bg-settings-grouped-surface active:opacity-60 disabled:opacity-40',
        label ? 'flex-row gap-1 px-2' : 'w-7 justify-center',
      )}
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
    >
      {isLoading ? (
        <Spinner color={foregroundColor} size="sm" />
      ) : (
        <Icon
          className={isDisabled ? 'size-4 text-default-foreground' : 'size-4 text-foreground'}
          strokeWidth={2}
        />
      )}
      {label ? <Text className="font-medium text-default-foreground text-sm">{label}</Text> : null}
    </Pressable>
  );
}
