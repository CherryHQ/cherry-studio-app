import { CheckIcon } from '@cherrystudio/app-icons';
import { Switch } from '@cherrystudio/ui/components';
import { ThemeMode } from '@cherrystudio/universal/data/preference';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

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

/**
 * Miniature of a chat screen, drawn entirely from semantic tokens inside a
 * `ScopedTheme`. Both swatches are on screen at once while the app itself is in
 * one theme, which is what the scope is for — it makes `bg-background` and
 * friends resolve against the previewed theme instead of the active one.
 *
 * This used to hand-paint two `neutral-*` ladders with an `isDark` ternary on
 * every node, because a raw palette step is the only thing that does not follow
 * the active theme. That made the preview a drawing of the design rather than a
 * view of it: it kept showing a blue user bubble long after the real one became
 * a gray overlay, and it could not show a custom brand color at all. Scoping it
 * costs one wrapper and keeps the preview honest by construction.
 */
function ThemePreview({ theme }: { theme: ResolvedThemeMode }) {
  return (
    // `ThemeMode` is a string enum, so it needs widening into uniwind's own
    // literal union — same boundary conversion `applyThemeModePreference` does.
    <ScopedTheme theme={theme === ThemeMode.dark ? 'dark' : 'light'}>
      <View
        className="w-24 max-w-full overflow-hidden rounded-lg border border-border bg-background"
        style={{ aspectRatio: 9 / 16, borderCurve: 'continuous' }}
      >
        <View className="h-7 flex-row items-center border-border-subtle border-b bg-card px-2">
          <View className="size-2 rounded-full bg-border-strong" />
          <View className="flex-1 items-center">
            <View className="h-1.5 w-7 rounded-full bg-border-strong" />
          </View>
          <View className="size-2" />
        </View>
        <View className="min-h-0 flex-1 gap-3 p-2">
          {/* Assistant turns are bare text on the page — no bubble — so the two
              sides are told apart by the user bubble alone. Drawing one here
              would also be indistinguishable from it: `secondary` and
              `chat-user` are both gray-alpha-100. */}
          <View className="w-4/5 gap-1">
            <View className="h-1 w-full rounded-full bg-muted-foreground" />
            <View className="h-1 w-2/3 rounded-full bg-muted-foreground" />
          </View>
          <View className="h-5 w-3/4 self-end justify-center gap-1 rounded-lg bg-chat-user px-2">
            <View className="h-1 w-full rounded-full bg-muted-foreground" />
            <View className="h-1 w-1/2 self-end rounded-full bg-muted-foreground" />
          </View>
          <View className="h-1 w-1/2 rounded-full bg-muted-foreground" />
          <View className="flex-1" />
          <View className="h-6 flex-row items-center rounded-full border border-border bg-card px-2">
            <View className="h-1 w-1/2 rounded-full bg-border-strong" />
            <View className="flex-1" />
            <View className="size-3 rounded-full bg-foreground" />
          </View>
        </View>
      </View>
    </ScopedTheme>
  );
}

function ThemeSelectionIndicator({ selected }: { selected: boolean }) {
  return selected ? (
    <View className="size-6 items-center justify-center rounded-full bg-foreground">
      <CheckIcon className="size-4 text-background" />
    </View>
  ) : (
    <View className="size-6 rounded-full border-2 border-muted-foreground" />
  );
}
