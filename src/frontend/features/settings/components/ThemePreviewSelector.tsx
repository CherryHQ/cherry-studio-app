import { Switch } from '@cherrystudio/ui/components';
import { ThemeMode } from '@cherrystudio/universal/data/preference';
import { CheckIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

type ResolvedThemeMode = ThemeMode.dark | ThemeMode.light;

type ThemePreviewSelectorProps = {
  isAutomatic: boolean;
  onAutomaticChange: (isAutomatic: boolean) => void;
  onThemeChange: (theme: ResolvedThemeMode) => void;
  selectedTheme: ResolvedThemeMode;
};

const previewOptions = [ThemeMode.light, ThemeMode.dark] as const;

export function ThemePreviewSelector({
  isAutomatic,
  onAutomaticChange,
  onThemeChange,
  selectedTheme,
}: ThemePreviewSelectorProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-4 pt-2">
      <View className="flex-row gap-4">
        {previewOptions.map((theme) => {
          const selected = theme === selectedTheme;

          return (
            <Pressable
              accessibilityLabel={t(`settings.options.theme.${theme}`)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className="min-w-0 flex-1 items-center gap-2 active:opacity-70"
              key={theme}
              onPress={() => onThemeChange(theme)}
              testID={`theme-preview-${theme}`}
            >
              <ThemePreview theme={theme} />
              <Text className="text-base text-foreground">
                {t(`settings.options.theme.${theme}`)}
              </Text>
              <ThemeSelectionIndicator selected={selected} />
            </Pressable>
          );
        })}
      </View>

      <View className="h-px bg-border" />

      <View className="min-h-10 flex-row items-center justify-between gap-4">
        <Text className="min-w-0 flex-1 text-base text-foreground">
          {t('settings.appearance.automatic')}
        </Text>
        <Switch
          accessibilityLabel={t('settings.appearance.automatic')}
          onValueChange={onAutomaticChange}
          testID="theme-automatic-switch"
          value={isAutomatic}
        />
      </View>
    </View>
  );
}

function ThemePreview({ theme }: { theme: ResolvedThemeMode }) {
  const isDark = theme === ThemeMode.dark;

  return (
    <View
      className={
        isDark
          ? 'w-24 max-w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950'
          : 'w-24 max-w-full overflow-hidden rounded-lg border border-neutral-300 bg-white'
      }
      style={{ aspectRatio: 9 / 16, borderCurve: 'continuous' }}
    >
      <View
        className={
          isDark
            ? 'h-7 flex-row items-center border-neutral-800 border-b bg-neutral-900 px-2'
            : 'h-7 flex-row items-center border-neutral-200 border-b bg-neutral-100 px-2'
        }
      >
        <View
          className={
            isDark ? 'size-2 rounded-full bg-neutral-600' : 'size-2 rounded-full bg-neutral-300'
          }
        />
        <View className="flex-1 items-center">
          <View
            className={
              isDark
                ? 'h-1.5 w-7 rounded-full bg-neutral-600'
                : 'h-1.5 w-7 rounded-full bg-neutral-300'
            }
          />
        </View>
        <View className="size-2" />
      </View>
      <View className="min-h-0 flex-1 gap-2 p-2">
        <View
          className={
            isDark
              ? 'h-6 w-4/5 justify-center gap-1 rounded-lg rounded-bl-sm bg-neutral-800 px-2'
              : 'h-6 w-4/5 justify-center gap-1 rounded-lg rounded-bl-sm bg-neutral-200 px-2'
          }
        >
          <View
            className={
              isDark
                ? 'h-1 w-full rounded-full bg-neutral-600'
                : 'h-1 w-full rounded-full bg-neutral-400'
            }
          />
          <View
            className={
              isDark
                ? 'h-1 w-2/3 rounded-full bg-neutral-600'
                : 'h-1 w-2/3 rounded-full bg-neutral-400'
            }
          />
        </View>
        <View className="h-5 w-3/4 self-end justify-center gap-1 rounded-lg rounded-br-sm bg-blue-500 px-2">
          <View className="h-1 w-full rounded-full bg-white/80" />
          <View className="h-1 w-1/2 self-end rounded-full bg-white/80" />
        </View>
        <View
          className={
            isDark
              ? 'h-4 w-1/2 rounded-lg rounded-bl-sm bg-neutral-800'
              : 'h-4 w-1/2 rounded-lg rounded-bl-sm bg-neutral-200'
          }
        />
        <View className="flex-1" />
        <View
          className={
            isDark
              ? 'h-6 flex-row items-center rounded-full border border-neutral-700 bg-neutral-900 px-2'
              : 'h-6 flex-row items-center rounded-full border border-neutral-300 bg-neutral-100 px-2'
          }
        >
          <View
            className={
              isDark
                ? 'h-1 w-1/2 rounded-full bg-neutral-700'
                : 'h-1 w-1/2 rounded-full bg-neutral-300'
            }
          />
          <View className="flex-1" />
          <View className="size-3 rounded-full bg-blue-500" />
        </View>
      </View>
    </View>
  );
}

function ThemeSelectionIndicator({ selected }: { selected: boolean }) {
  return selected ? (
    <View className="size-6 items-center justify-center rounded-full bg-primary">
      <CheckIcon className="size-4 text-primary-foreground" strokeWidth={3} />
    </View>
  ) : (
    <View className="size-6 rounded-full border-2 border-muted-foreground" />
  );
}
