import CheckIcon from '@cherrystudio/app-icons/icons/check';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/avatar';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { getProviderModelBadges, type ProviderModelBadge } from '../utils/providerModelBadges';
import { ProviderModelBadge as ProviderModelBadgeChip } from './ProviderModelBadge';

export type ProviderModelRowVariant = 'management' | 'synchronization';

export const providerModelRowEstimatedHeights = {
  management: 42,
  synchronization: 58,
} as const satisfies Record<ProviderModelRowVariant, number>;

const providerModelBadgeLabelKeys = {
  free: 'models.capability.free',
  vision: 'models.capability.imageRecognition',
} as const satisfies Record<ProviderModelBadge, string>;

/**
 * One model, as both screens that list models draw it: the provider's own tab
 * and the pull preview. Both now select rather than act row by row, so neither
 * puts anything at the end of the row; `children` is the slot if one ever does.
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
  variant,
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
  /** Management prioritizes decision-useful badges; synchronization keeps the provider's raw id. */
  variant: ProviderModelRowVariant;
}) {
  const { t } = useTranslation();
  const hasDistinctModelId = model.modelId.trim() !== model.name.trim();
  const badges = variant === 'management' ? getProviderModelBadges(model) : [];
  const accessibilityDetails =
    variant === 'synchronization' && hasDistinctModelId
      ? [model.modelId]
      : badges.map((badge) => t(providerModelBadgeLabelKeys[badge]));
  const accessibilityLabel = [model.name, ...accessibilityDetails].join(', ');
  const rowClassName = [
    'flex-row items-center gap-3 px-4 py-2',
    selection ? 'min-h-11' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {selection ? (
        <ProviderModelRowCheckbox
          isDisabled={selection.isDisabled}
          isSelected={selection.isSelected}
        />
      ) : null}
      {/* Unsized, so it is `BrandAvatar`'s own square — the one a provider row
          draws, and the one the picker sheet draws beside the same single line
          of text. */}
      <ModelAvatar model={model} provider={provider} />
      <View className="min-w-0 flex-1">
        <Text
          className={
            tone === 'struck'
              ? 'text-base text-foreground line-through'
              : 'text-base text-foreground'
          }
          numberOfLines={1}
        >
          {model.name}
        </Text>
        {variant === 'synchronization' && hasDistinctModelId ? (
          <Text
            selectable={!selection}
            className="text-foreground-tertiary text-xs"
            numberOfLines={1}
          >
            {model.modelId}
          </Text>
        ) : null}
      </View>
      {badges.length > 0 ? (
        <View className="flex-row items-center gap-1">
          {badges.map((badge) => (
            <ProviderModelBadgeChip badge={badge} key={`${model.id}:${badge}`} />
          ))}
        </View>
      ) : null}
      {children}
    </>
  );

  if (!selection) {
    return (
      <View accessibilityLabel={accessibilityLabel} accessible className={rowClassName}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
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

/** The same tick the session list draws, since both lists select the same way. */
function ProviderModelRowCheckbox({
  isDisabled,
  isSelected,
}: {
  isDisabled?: boolean;
  isSelected: boolean;
}) {
  const disabledClassName = isDisabled ? ' opacity-40' : '';

  return (
    <View
      className={
        isSelected
          ? `size-6 items-center justify-center rounded-full bg-foreground${disabledClassName}`
          : `size-6 items-center justify-center rounded-full border-2 border-border-strong${disabledClassName}`
      }
    >
      {isSelected ? <CheckIcon className="size-4 text-background" /> : null}
    </View>
  );
}
