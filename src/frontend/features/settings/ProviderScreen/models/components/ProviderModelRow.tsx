import { Section } from '@cherrystudio/ui/components';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import {
  getModelPickerTags,
  isFreeModel,
  ModelPickerIcon,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/frontend/components/modelPicker';

import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

export const providerModelRowEstimatedHeight = 48;
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

  const trailing =
    tags.length > 0 || children ? (
      <View className="flex-row items-center gap-1">
        {tags.slice(0, providerModelRowMaxTags).map((tag) => (
          <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
        ))}
        {children}
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
        leading={<ModelPickerIcon model={model} provider={provider} />}
        onPress={onPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        showChevron={false}
        trailing={trailing}
      />
    </SettingsGroupedSurface>
  );
}

// `getModelPickerTags` only covers capabilities; free is inferred, so it is not
// among them.
function getProviderModelRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreeModel(model) ? [...tags, 'free'] : tags;
}
