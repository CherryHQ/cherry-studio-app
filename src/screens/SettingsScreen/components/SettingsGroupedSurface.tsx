import { cn } from 'heroui-native/utils';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SettingsGroupedSeparator } from './SettingsGroupedSeparator';

/**
 * One slot of a grouped card: it owns the surface, whichever corners it happens
 * to sit on, and the hairline separating it from the slot above.
 *
 * A virtualized list cannot wrap its rows in a single card, so each row draws
 * its own share of one. Keeping the surface out here rather than on the row's
 * `Pressable` is what lets the hairline be inset without leaving a gap in the
 * card — the same shape `SettingsServiceRow` gets from a real card wrapper.
 */
export function SettingsGroupedSurface({
  children,
  className,
  isFirst,
  isLast,
}: {
  children: ReactNode;
  /** Applied last, so a row can tint its own surface. */
  className?: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <View
      className={cn(
        'bg-settings-grouped-surface',
        getSurfaceRadiusClassName(isFirst, isLast),
        className,
      )}
    >
      {isFirst ? null : <SettingsGroupedSeparator />}
      {children}
    </View>
  );
}

function getSurfaceRadiusClassName(isFirst: boolean, isLast: boolean): string {
  if (isFirst && isLast) {
    return 'rounded-xl';
  }

  if (isFirst) {
    return 'rounded-t-xl';
  }

  return isLast ? 'rounded-b-xl' : '';
}
