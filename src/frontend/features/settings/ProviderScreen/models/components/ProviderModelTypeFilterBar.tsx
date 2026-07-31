import { cn } from 'heroui-native/utils';
import {
  ArrowUpDownIcon,
  AudioLinesIcon,
  BoxesIcon,
  ImageIcon,
  MicIcon,
  SpeechIcon,
  TypeIcon,
  VideoIcon,
} from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import {
  PROVIDER_MODEL_TYPE_FILTERS,
  PROVIDER_MODEL_TYPE_LABEL_KEYS,
  type ProviderModelTypeCounts,
  type ProviderModelTypeFilter,
} from '../utils/providerModelTypeFilter';

// `all` is the only tab without a glyph, the same way desktop draws it: it is a
// reset rather than a type, so there is nothing to picture.
const providerModelTypeIcons = {
  all: null,
  audio: AudioLinesIcon,
  embedding: BoxesIcon,
  image: ImageIcon,
  rerank: ArrowUpDownIcon,
  speech: SpeechIcon,
  text: TypeIcon,
  transcription: MicIcon,
  video: VideoIcon,
} as const satisfies Record<ProviderModelTypeFilter, typeof TypeIcon | null>;

/**
 * Desktop's model-type tab row. Every type is always offered, count and all —
 * a zero tells you the provider has none of that kind, which is why the counts
 * are there in the first place.
 */
export function ProviderModelTypeFilterBar({
  counts,
  onSelect,
  selectedFilter,
}: {
  counts: ProviderModelTypeCounts;
  onSelect: (filter: ProviderModelTypeFilter) => void;
  selectedFilter: ProviderModelTypeFilter;
}) {
  const { t } = useTranslation();

  return (
    <ScrollView
      className="rounded-xl bg-settings-grouped-surface"
      contentContainerStyle={styles.track}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
    >
      {PROVIDER_MODEL_TYPE_FILTERS.map((filter) => {
        const Icon = providerModelTypeIcons[filter];
        const isSelected = filter === selectedFilter;
        const label = t(PROVIDER_MODEL_TYPE_LABEL_KEYS[filter]);

        return (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={cn(
              'h-7 flex-row items-center gap-1.5 rounded-lg px-2 active:opacity-60',
              // The track and the selected pill share one translucent token, so
              // the pill reads as raised in either theme without a second color.
              isSelected && 'bg-settings-grouped-surface',
            )}
            key={filter}
            onPress={() => onSelect(filter)}
          >
            {Icon ? (
              <Icon
                className={cn(
                  'size-3.5',
                  isSelected ? 'text-foreground' : 'text-default-foreground',
                )}
                strokeWidth={2}
              />
            ) : null}
            <Text
              className={cn(
                'text-xs',
                isSelected ? 'font-medium text-foreground' : 'text-default-foreground',
              )}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text className="text-foreground-muted text-xs">{counts[filter]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
  },
  track: {
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
});
