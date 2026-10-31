import CheckIcon from '@cherrystudio/app-icons/icons/check';
import {
  normalizeThemePalette,
  THEME_PALETTE_IDS,
  THEME_PALETTES,
  type ThemePaletteId,
} from '@cherrystudio/design-tokens/palettes';
import { Section, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { usePreference } from '@/frontend/data/hooks';

const paletteLabelKeys = {
  green: 'settings.options.themePalette.green',
  blue: 'settings.options.themePalette.blue',
  purple: 'settings.options.themePalette.purple',
  teal: 'settings.options.themePalette.teal',
  orange: 'settings.options.themePalette.orange',
  pink: 'settings.options.themePalette.pink',
} as const satisfies Record<ThemePaletteId, string>;

export function ThemePaletteSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme } = useUniwind();
  const [storedPalette, setPalette] = usePreference('ui.theme_palette');
  const selectedPalette = normalizeThemePalette(storedPalette);
  const appearance = theme === 'dark' ? 'dark' : 'light';

  function selectPalette(palette: ThemePaletteId) {
    if (palette === selectedPalette) return;

    void setPalette(palette, { optimistic: true }).catch(() => {
      toast.show({ label: t('settings.appearance.saveFailed'), variant: 'danger' });
    });
  }

  return (
    <Section title={t('settings.items.theme')}>
      <Section.Item>
        <ScrollView
          contentContainerClassName="grow flex-row justify-between gap-1"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {THEME_PALETTE_IDS.map((palette) => {
            const selected = palette === selectedPalette;

            return (
              <Pressable
                accessibilityLabel={t(paletteLabelKeys[palette])}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className="h-12 min-w-11 flex-1 items-center justify-center active:opacity-70"
                key={palette}
                onPress={() => selectPalette(palette)}
                testID={`theme-palette-${palette}`}
              >
                <View
                  className={
                    selected
                      ? 'size-10 items-center justify-center rounded-full border-2 border-primary'
                      : 'size-10 items-center justify-center rounded-full border-2 border-transparent'
                  }
                >
                  <View
                    className="size-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: THEME_PALETTES[palette][appearance] }}
                  >
                    {selected ? <CheckIcon className="size-5 text-primary-foreground" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Section.Item>
    </Section>
  );
}
