import { Section } from '@cherrystudio/ui/components';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/ModelAvatar';
import {
  getModelPickerTags,
  isFreeModel,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/frontend/components/modelPicker';

import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

/**
 * Squared off against the text beside it: the name line is 24 (`text-base`'s
 * line height), the capability chips are 20, and `Section.Item` puts 4 between
 * them. Anything smaller floats in the middle of the two lines.
 */
const providerModelRowAvatarSize = 48;
/**
 * The avatar plus the row's vertical padding. Rows without capabilities are
 * shorter; the lists tell the two apart through
 * {@link getProviderModelRowItemType} so the virtualizer measures each kind.
 */
export const providerModelRowEstimatedHeight = providerModelRowAvatarSize + 24;

/**
 * One model, as both screens that list models draw it: the provider's own tab
 * and the pull preview. They differ only in what sits at the end of the row —
 * a remove button on one side, the pull's `+`/`-` on the other — so that is
 * what `children` is for.
 */
export function ProviderModelRow({
  children,
  hideSeparator = false,
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
  hideSeparator?: boolean;
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
  const [isPressed, setIsPressed] = useState(false);
  // Its own line rather than the trailing slot, which the capabilities used to
  // share with the action button — a model with many of them pushed the name off
  // the row. Down here the strip has the width the name is not using, and what
  // still overflows is clipped rather than pushing anything.
  const capabilities =
    tags.length > 0 ? (
      <View className="flex-row items-center gap-1 overflow-hidden">
        {tags.map((tag) => (
          <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
        ))}
      </View>
    ) : undefined;

  return (
    <SettingsGroupedSurface
      className={surfaceClassName}
      hideSeparator={hideSeparator || isPressed}
      isFirst={isFirst}
      isLast={isLast}
    >
      <Section.Item
        accessibilityLabel={model.name}
        accessibilityState={{ busy: isDisabled, disabled: isDisabled }}
        description={capabilities}
        disabled={isDisabled}
        label={
          tone === 'struck' ? (
            <Text className="text-foreground text-base line-through" numberOfLines={1}>
              {model.name}
            </Text>
          ) : (
            model.name
          )
        }
        leading={
          <ModelAvatar model={model} provider={provider} size={providerModelRowAvatarSize} />
        }
        onPress={onPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        showChevron={false}
        trailing={children}
      />
    </SettingsGroupedSurface>
  );
}

/**
 * Which of the two heights a model's row will take. A list mixing both has to
 * tell them apart for its virtualizer, which sizes by item type.
 */
export function getProviderModelRowItemType(model: Model): 'capabilities' | 'compact' {
  return getProviderModelRowTags(model).length > 0 ? 'capabilities' : 'compact';
}

// `getModelPickerTags` only covers capabilities; free is inferred, so it is not
// among them.
function getProviderModelRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreeModel(model) ? [...tags, 'free'] : tags;
}
