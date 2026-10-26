import { SelectionIndicator } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type AccessibilityProps } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { getProviderModelBadges, type ProviderModelBadge } from '../utils/providerModelBadges';
import { ProviderModelBadge as ProviderModelBadgeChip } from './ProviderModelBadge';

export type ProviderModelRowVariant = 'management' | 'synchronization';

export const providerModelRowEstimatedHeights = {
  management: 44,
  synchronization: 44,
} as const satisfies Record<ProviderModelRowVariant, number>;

const providerModelBadgeLabelKeys = {
  free: 'models.capability.free',
  vision: 'models.capability.imageRecognition',
} as const satisfies Record<ProviderModelBadge, string>;

/**
 * One model, as both screens that list models draw it: the provider's own tab
 * and the pull preview. `children` carries a compact trailing control in
 * management mode; synchronization mode makes the whole row selectable.
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
  onPress,
  disabled = false,
  statusLabel,
  accessibilityActions,
  onAccessibilityAction,
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
  onPress?: () => void;
  disabled?: boolean;
  statusLabel?: string;
  accessibilityActions?: AccessibilityProps['accessibilityActions'];
  onAccessibilityAction?: AccessibilityProps['onAccessibilityAction'];
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
  /** `struck` reads as "on its way out", the way the pull screen marks a model absent from the latest response. */
  tone?: 'default' | 'struck';
  /** Management shows decision-useful badges; synchronization stays visually quiet. */
  variant: ProviderModelRowVariant;
}) {
  const { t } = useTranslation();
  const badges = variant === 'management' ? getProviderModelBadges(model) : [];
  const accessibilityDetails = badges.map((badge) => t(providerModelBadgeLabelKeys[badge]));
  const accessibilityLabel = [model.name, statusLabel, ...accessibilityDetails]
    .filter(Boolean)
    .join(', ');
  const rowClassName = [
    onPress && !selection
      ? 'min-h-11 flex-row items-center gap-3 px-4'
      : 'flex-row items-center gap-3 px-4 py-2',
    selection ? 'min-h-11' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
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
        {statusLabel ? (
          <Text className="text-foreground-tertiary text-xs">{statusLabel}</Text>
        ) : null}
      </View>
      {badges.length > 0 ? (
        <View className="flex-row items-center gap-1">
          {badges.map((badge) => (
            <ProviderModelBadgeChip badge={badge} key={`${model.id}:${badge}`} />
          ))}
        </View>
      ) : null}
    </>
  );

  if (!selection && onPress) {
    return (
      <View className={rowClassName}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          disabled={disabled}
          accessibilityState={{ disabled }}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
          className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 py-1 active:opacity-60"
          onPress={onPress}
        >
          {content}
        </Pressable>
        {children}
      </View>
    );
  }

  if (!selection) {
    return (
      <View
        accessibilityLabel={children ? undefined : accessibilityLabel}
        accessible={!children}
        className={rowClassName}
      >
        {content}
        {children}
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
      <SelectionIndicator disabled={selection.isDisabled} selected={selection.isSelected} />
      {content}
      {children}
    </Pressable>
  );
}
