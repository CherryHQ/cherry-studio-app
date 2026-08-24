import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { ThemeMode } from '@/shared/data/preference';

type ThemePreviewSelectorProps = {
  onThemeChange: (theme: ThemeMode) => void;
  selectedTheme: ThemeMode;
};

type PreviewPalette = {
  ground: string;
  line: string;
  surface: string;
};

const previewOptions = [ThemeMode.system, ThemeMode.light, ThemeMode.dark] as const;
const previewPalette: Record<ThemeMode.light | ThemeMode.dark, PreviewPalette> = {
  [ThemeMode.light]: { ground: '#e5e5e5', line: '#e5e5e5', surface: '#ffffff' },
  [ThemeMode.dark]: { ground: '#171717', line: '#404040', surface: '#262626' },
};
const previewAccent = '#c1704f';
const previewFrame = { height: 70, rx: 16, width: 88, x: 0, y: 0 } as const;
const previewSurface = { height: 54, rx: 10, width: 72, x: 8, y: 8 } as const;
const previewDiagonal = `M${previewFrame.width} 0V${previewFrame.height}H0Z`;

export function ThemePreviewSelector({ onThemeChange, selectedTheme }: ThemePreviewSelectorProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-row gap-3 py-2">
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
            <View
              className={
                selected
                  ? 'overflow-hidden rounded-2xl border-2 border-foreground p-1'
                  : 'overflow-hidden rounded-2xl border-2 border-transparent p-1'
              }
            >
              <View className="overflow-hidden rounded-2xl">
                <ThemePreview mode={theme} />
              </View>
            </View>
            <Text
              className={
                selected
                  ? 'text-center text-base text-foreground'
                  : 'text-center text-base text-muted-foreground'
              }
              numberOfLines={1}
            >
              {t(`settings.options.theme.${theme}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const clipId = `theme-preview-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const palette = previewPalette[mode === ThemeMode.dark ? ThemeMode.dark : ThemeMode.light];

  return (
    <Svg height={previewFrame.height} viewBox="0 0 88 70" width={previewFrame.width}>
      <Rect {...previewFrame} fill={palette.ground} />
      <Rect {...previewSurface} fill={palette.surface} />
      <Rect fill={palette.line} height={4} rx={2} width={34} x={17} y={18} />
      <Rect fill={palette.line} height={4} rx={2} width={23} x={17} y={26} />

      {mode === ThemeMode.system ? (
        <>
          <Defs>
            <ClipPath id={`${clipId}-frame`}>
              <Rect {...previewFrame} />
            </ClipPath>
            <ClipPath id={`${clipId}-surface`}>
              <Rect {...previewSurface} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${clipId}-frame)`}>
            <Path d={previewDiagonal} fill={previewPalette[ThemeMode.dark].ground} />
          </G>
          <G clipPath={`url(#${clipId}-surface)`}>
            <Path d={previewDiagonal} fill={previewPalette[ThemeMode.dark].surface} />
          </G>
        </>
      ) : null}

      <Circle cx={64} cy={47} fill={previewAccent} r={8} />
    </Svg>
  );
}
