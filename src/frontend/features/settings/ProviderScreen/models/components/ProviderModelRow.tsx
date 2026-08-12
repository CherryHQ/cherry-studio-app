import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { CheckIcon } from 'lucide-uniwind/png';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/ModelAvatar';
import {
  getModelPickerTags,
  isFreeModel,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/frontend/components/modelPicker';

/**
 * `BrandAvatar`'s own size, the one a provider row uses — a model row is the
 * same single line of text beside the same square frame.
 */
const providerModelRowAvatarSize = 26;
/**
 * `py-2` around the tallest thing in the row. That is the caller's icon-only
 * button (`p-2` around a 16 glyph, so 32), not the avatar.
 */
export const providerModelRowEstimatedHeight = 48;

/**
 * One model, as both screens that list models draw it: the provider's own tab
 * and the pull preview. They differ only in what sits at the end of the row —
 * a remove button on one side, the pull's `+`/`-` on the other — so that is
 * what `children` is for.
 *
 * Laid out here rather than through `Section.Item`, whose `py-3` is fixed: a
 * settings row holds one tappable line and can afford the height, but this one
 * repeats down a list hundreds of models long. Nothing is drawn between rows
 * either — a hairline every 48pt reads as a grid, and the avatars already give
 * the eye a column to follow.
 */
export function ProviderModelRow({
  children,
  className,
  model,
  provider,
  selection,
  tone = 'default',
}: {
  /** The row's trailing action. */
  children?: ReactNode;
  /** Applied last, so a row can tint itself. */
  className?: string;
  model: Model;
  provider: Provider | undefined;
  /**
   * Given only while the list is selecting. The row then draws a checkbox and
   * becomes the control that ticks it — nothing else on it is tappable.
   */
  selection?: {
    isDisabled?: boolean;
    isSelected: boolean;
    onToggle: () => void;
  };
  /** `struck` reads as "on its way out", the way the pull screen marks a model the provider no longer serves. */
  tone?: 'default' | 'struck';
}) {
  const tags = getProviderModelRowTags(model);
  const rowClassName = className
    ? `flex-row items-center gap-3 px-4 py-2 ${className}`
    : 'flex-row items-center gap-3 px-4 py-2';
  const content = (
    <>
      {selection ? <ProviderModelRowCheckbox isSelected={selection.isSelected} /> : null}
      <ModelAvatar model={model} provider={provider} size={providerModelRowAvatarSize} />
      {/* The one part of the row that gives: the capabilities and the action
          keep their natural width, so a long model id ellipsizes rather than
          pushing them off the end. */}
      <Text
        className={
          tone === 'struck'
            ? 'min-w-0 flex-1 text-base text-foreground line-through'
            : 'min-w-0 flex-1 text-base text-foreground'
        }
        numberOfLines={1}
      >
        {model.name}
      </Text>
      {tags.length > 0 ? (
        <View className="flex-row items-center gap-1">
          {tags.map((tag) => (
            <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
          ))}
        </View>
      ) : null}
      {children}
    </>
  );

  if (!selection) {
    return (
      <View accessibilityLabel={model.name} accessible className={rowClassName}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={model.name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selection.isSelected, disabled: selection.isDisabled }}
      className={`${rowClassName} active:bg-foreground/5`}
      disabled={selection.isDisabled}
      onPress={selection.onToggle}
    >
      {content}
    </Pressable>
  );
}

/** The same tick the topic list draws, since both lists select the same way. */
function ProviderModelRowCheckbox({ isSelected }: { isSelected: boolean }) {
  return (
    <View
      className={
        isSelected
          ? 'size-6 items-center justify-center rounded-full bg-primary'
          : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
      }
    >
      {isSelected ? <CheckIcon className="size-4 text-primary-foreground" strokeWidth={3} /> : null}
    </View>
  );
}

// `getModelPickerTags` only covers capabilities; free is inferred, so it is not
// among them.
function getProviderModelRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreeModel(model) ? [...tags, 'free'] : tags;
}
