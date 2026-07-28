import { cn } from 'heroui-native/utils';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getModelPickerTags,
  ModelPickerIcon,
  type ModelPickerModelItem,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/components/modelPicker';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

// One line of text against a 32pt avatar, plus the row's vertical padding. The
// model id, when a row needs it, adds a second line.
export const providerModelRowHeight = 48;
export const providerModelRowWithIdentifierHeight = 56;
// Past this the capability strip starts squeezing the model name off the row.
const providerModelRowMaxTags = 4;

/**
 * One model, as both screens that list models draw it: the provider's own tab
 * and the pull preview. They differ only in what sits at the end of the row —
 * a remove button on one side, the pull's `+`/`-` on the other — so that is
 * what `children` is for.
 */
export function ProviderModelRow({
  children,
  isDisabled = false,
  isFirst,
  isLast,
  model,
  onPress,
  provider,
  showIdentifier,
  surfaceClassName,
  tone = 'default',
}: {
  /** The row's trailing action. */
  children?: ReactNode;
  isDisabled?: boolean;
  isFirst: boolean;
  isLast: boolean;
  model: Model;
  /** Given only when the row itself is the action. */
  onPress?: () => void;
  provider: Provider | undefined;
  /**
   * Whether to spell out the model id under the name. Worth the second line
   * only when another model in the same list answers to the same name — see
   * `createAmbiguousModelNameTest`.
   */
  showIdentifier: boolean;
  /** Applied last, so a row can tint its own surface. */
  surfaceClassName?: string;
  /** `struck` reads as "on its way out", the way the pull screen marks a model the provider no longer serves. */
  tone?: 'default' | 'struck';
}) {
  const tags = useMemo(() => getProviderModelRowTags(model), [model]);
  const modelPickerItem = useMemo<ModelPickerModelItem | null>(() => {
    if (!provider) {
      return null;
    }

    return {
      isPinned: false,
      key: `${model.id}:provider-model-row`,
      model,
      modelId: model.id,
      modelIdentifier: model.modelId,
      provider,
      showIdentifier,
    };
  }, [model, provider, showIdentifier]);

  const rowStyle = showIdentifier ? styles.rowWithIdentifier : styles.row;
  const content = (
    <>
      {modelPickerItem ? (
        <ModelPickerIcon item={modelPickerItem} />
      ) : (
        <ProviderModelRowFallbackIcon model={model} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'min-w-0 shrink text-sm',
            tone === 'struck' ? 'text-default-foreground line-through' : 'text-foreground',
          )}
          numberOfLines={1}
        >
          {model.name}
        </Text>
        {showIdentifier ? (
          <Text className="min-w-0 shrink text-default-foreground text-xs" numberOfLines={1}>
            {model.modelId}
          </Text>
        ) : null}
      </View>
      {tags.length > 0 ? (
        <View className="shrink-0 flex-row items-center gap-1">
          {tags.slice(0, providerModelRowMaxTags).map((tag) => (
            <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
          ))}
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <SettingsGroupedSurface className={surfaceClassName} isFirst={isFirst} isLast={isLast}>
      {onPress ? (
        <Pressable
          accessibilityLabel={model.name}
          accessibilityRole="button"
          accessibilityState={{ busy: isDisabled, disabled: isDisabled }}
          className="flex-row items-center gap-3 px-4 py-2 active:opacity-60 disabled:opacity-40"
          disabled={isDisabled}
          onPress={onPress}
          style={rowStyle}
        >
          {content}
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3 px-4 py-2" style={rowStyle}>
          {content}
        </View>
      )}
    </SettingsGroupedSurface>
  );
}

function ProviderModelRowFallbackIcon({ model }: { model: Model }) {
  const initial = model.name.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View className="size-8 items-center justify-center rounded-full">
      <Text className="font-medium text-default-foreground text-xs">{initial}</Text>
    </View>
  );
}

function getProviderModelRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreeProviderModel(model) && !tags.includes('free') ? [...tags, 'free'] : tags;
}

function isFreeProviderModel(model: Model) {
  return [model.id, model.modelId, model.name, model.presetModelId]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes('free');
}

const styles = StyleSheet.create({
  row: {
    height: providerModelRowHeight,
  },
  rowWithIdentifier: {
    height: providerModelRowWithIdentifierHeight,
  },
});
