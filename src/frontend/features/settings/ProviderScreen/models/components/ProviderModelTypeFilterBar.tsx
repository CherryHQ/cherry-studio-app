import { Tabs } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
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
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PROVIDER_MODEL_TYPE_FILTERS,
  PROVIDER_MODEL_TYPE_LABEL_KEYS,
  type ProviderModelTypeCounts,
  type ProviderModelTypeFilter,
} from '../utils/providerModelTypeFilter';

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

function ProviderModelTypeTabContent({
  count,
  filter,
  isSelected,
  label,
}: {
  count: number;
  filter: ProviderModelTypeFilter;
  isSelected: boolean;
  label: string;
}) {
  const Icon = providerModelTypeIcons[filter];

  return (
    <View className="max-w-full flex-row items-center justify-center gap-1.5">
      {/* Selection is carried by the label's weight alone — an icon has no
       * weight axis, and tinting only it would put the two halves of one tab
       * on different signals. */}
      {Icon ? <Icon className="size-3.5 shrink-0 text-foreground" strokeWidth={2} /> : null}
      <Text
        adjustsFontSizeToFit
        className={cn(
          'min-w-0 text-xs',
          isSelected ? 'font-medium text-foreground' : 'text-foreground',
        )}
        minimumFontScale={0.8}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text className="shrink-0 text-foreground-tertiary text-xs">{count}</Text>
    </View>
  );
}

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
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
    >
      <Tabs
        items={PROVIDER_MODEL_TYPE_FILTERS.map((filter) => {
          const label = t(PROVIDER_MODEL_TYPE_LABEL_KEYS[filter]);

          return {
            children: (
              <ProviderModelTypeTabContent
                count={counts[filter]}
                filter={filter}
                isSelected={filter === selectedFilter}
                label={label}
              />
            ),
            label,
            testID: `provider-model-type-tab-${filter}`,
            value: filter,
          };
        })}
        onValueChange={onSelect}
        style={styles.tabs}
        testID="provider-model-type-tabs"
        value={selectedFilter}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
  },
  tabs: {
    width: PROVIDER_MODEL_TYPE_FILTERS.length * 96,
  },
});
