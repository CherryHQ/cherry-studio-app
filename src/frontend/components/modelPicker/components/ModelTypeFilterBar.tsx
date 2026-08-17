import {
  ArrowUpDownIcon,
  AudioLinesIcon,
  BoxesIcon,
  ImageIcon,
  MicIcon,
  SpeechIcon,
  TypeIcon,
  VideoIcon,
} from '@cherrystudio/app-icons';
import { Tabs } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  MODEL_TYPE_FILTERS,
  MODEL_TYPE_LABEL_KEYS,
  type ModelTypeCounts,
  type ModelTypeFilter,
} from '../utils/modelTypeFilter';

const modelTypeIcons = {
  all: null,
  audio: AudioLinesIcon,
  embedding: BoxesIcon,
  image: ImageIcon,
  rerank: ArrowUpDownIcon,
  speech: SpeechIcon,
  text: TypeIcon,
  transcription: MicIcon,
  video: VideoIcon,
} as const satisfies Record<ModelTypeFilter, typeof TypeIcon | null>;

function ModelTypeTabContent({
  count,
  filter,
  isSelected,
  label,
}: {
  count: number;
  filter: ModelTypeFilter;
  isSelected: boolean;
  label: string;
}) {
  const Icon = modelTypeIcons[filter];

  return (
    <View className="max-w-full flex-row items-center justify-center gap-1.5">
      {/* Selection is carried by the label's weight alone — an icon has no
       * weight axis, and tinting only it would put the two halves of one tab
       * on different signals. */}
      {Icon ? <Icon className="size-3.5 shrink-0 text-foreground" /> : null}
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
export function ModelTypeFilterBar({
  counts,
  onSelect,
  selectedFilter,
}: {
  counts: ModelTypeCounts;
  onSelect: (filter: ModelTypeFilter) => void;
  selectedFilter: ModelTypeFilter;
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
        items={MODEL_TYPE_FILTERS.map((filter) => {
          const label = t(MODEL_TYPE_LABEL_KEYS[filter]);

          return {
            children: (
              <ModelTypeTabContent
                count={counts[filter]}
                filter={filter}
                isSelected={filter === selectedFilter}
                label={label}
              />
            ),
            label,
            testID: `model-type-tab-${filter}`,
            value: filter,
          };
        })}
        onValueChange={onSelect}
        style={styles.tabs}
        testID="model-type-tabs"
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
    width: MODEL_TYPE_FILTERS.length * 96,
  },
});
