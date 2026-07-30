import { cn } from 'heroui-native/utils';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getModelPickerTags,
  isFreeModel,
  ModelPickerIcon,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/frontend/components/modelPicker';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

// One line of text against a 32pt avatar, plus the row's vertical padding.
export const providerModelRowHeight = 48;
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
  /** Applied last, so a row can tint its own surface. */
  surfaceClassName?: string;
  /** `struck` reads as "on its way out", the way the pull screen marks a model the provider no longer serves. */
  tone?: 'default' | 'struck';
}) {
  const tags = getProviderModelRowTags(model);

  const content = (
    <>
      <ModelPickerIcon model={model} provider={provider} />
      <Text
        className={cn(
          'min-w-0 flex-1 text-sm',
          tone === 'struck' ? 'text-default-foreground line-through' : 'text-foreground',
        )}
        numberOfLines={1}
      >
        {model.name}
      </Text>
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
          style={styles.row}
        >
          {content}
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3 px-4 py-2" style={styles.row}>
          {content}
        </View>
      )}
    </SettingsGroupedSurface>
  );
}

// `getModelPickerTags` only covers capabilities; free is inferred, so it is not
// among them.
function getProviderModelRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreeModel(model) ? [...tags, 'free'] : tags;
}

const styles = StyleSheet.create({
  row: {
    height: providerModelRowHeight,
  },
});
