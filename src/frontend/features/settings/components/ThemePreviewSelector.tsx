import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { ScopedTheme } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { ThemeMode } from '@/shared/data/preference';

type ThemePreviewSelectorProps = {
  onThemeChange: (theme: ThemeMode) => void;
  selectedTheme: ThemeMode;
};

const previewOptions = [ThemeMode.system, ThemeMode.light, ThemeMode.dark] as const;
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
  if (mode === ThemeMode.system) {
    return (
      <View className="relative h-[70px] w-[88px] overflow-hidden rounded-2xl">
        <ScopedTheme theme="light">
          <ThemePreviewCanvas />
        </ScopedTheme>
        <View className="absolute inset-0">
          <ScopedTheme theme="dark">
            <ThemePreviewCanvas clipped />
          </ScopedTheme>
        </View>
      </View>
    );
  }

  return (
    <ScopedTheme theme={mode === ThemeMode.dark ? 'dark' : 'light'}>
      <ThemePreviewCanvas />
    </ScopedTheme>
  );
}

function ThemePreviewCanvas({ clipped = false }: { clipped?: boolean }) {
  const clipId = `theme-preview-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [ground, surface, line, accent] = useThemeColor([
    'grouped-background',
    'card',
    'border-strong',
    'primary',
  ]);

  return (
    <Svg height={previewFrame.height} viewBox="0 0 88 70" width={previewFrame.width}>
      {clipped ? (
        <Defs>
          <ClipPath id={clipId}>
            <Path d={previewDiagonal} />
          </ClipPath>
        </Defs>
      ) : null}
      <G clipPath={clipped ? `url(#${clipId})` : undefined}>
        <Rect {...previewFrame} fill={ground} />
        <Rect {...previewSurface} fill={surface} />
        <Rect fill={line} height={4} rx={2} width={34} x={17} y={18} />
        <Rect fill={line} height={4} rx={2} width={23} x={17} y={26} />
        <Circle cx={64} cy={47} fill={accent} r={8} />
      </G>
    </Svg>
  );
}
