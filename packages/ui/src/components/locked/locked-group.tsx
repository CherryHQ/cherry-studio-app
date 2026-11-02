import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '../../utils';
import { LockedGroupNesting, LockedScope, useLockedAppearance } from './locked-context';
import { LockedMark } from './locked-mark';

/** The group's header: the owner's mark and why nothing inside changes. */
export function LockedGroupHeader({ className }: { className?: string }) {
  const { reason } = useLockedAppearance();
  return (
    <View
      accessibilityRole="header"
      // Part of the card itself: a separate fill matched the page background in light mode.
      className={cn('flex-row items-center gap-2 border-border border-b px-4 py-3', className)}
    >
      <LockedMark />
      {reason ? (
        <Text className="min-w-0 flex-1 text-muted-foreground text-sm">{reason}</Text>
      ) : null}
    </View>
  );
}

/**
 * Encloses content another party owns in one outlined card headed by the owner's reason. Everything
 * inside renders locked, and sections inside flatten into the card instead of drawing their own.
 */
export function LockedGroup({
  children,
  className,
  contentClassName,
  testID,
}: {
  children: ReactNode;
  className?: string;
  /** Spacing for free-form content; sections inside bring their own. */
  contentClassName?: string;
  testID?: string;
}) {
  return (
    <View
      className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}
      style={{ borderCurve: 'continuous' }}
      testID={testID}
    >
      <LockedGroupHeader />
      <LockedScope>
        <LockedGroupNesting>
          <View className={cn('pb-1', contentClassName)}>{children}</View>
        </LockedGroupNesting>
      </LockedScope>
    </View>
  );
}

/**
 * One item of a locked group drawn by a virtualized list: the first slice carries the header, the
 * last closes the card, and every slice renders its content locked and flattened like the group.
 */
export function LockedGroupSlice({
  children,
  isFirst,
  isLast,
}: {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <View
      className={cn(
        'overflow-hidden border-border border-x bg-card',
        isFirst && 'rounded-t-2xl border-t',
        isLast && 'rounded-b-2xl border-b pb-1',
      )}
      style={{ borderCurve: 'continuous' }}
    >
      {isFirst ? <LockedGroupHeader /> : null}
      <LockedScope>
        <LockedGroupNesting>{children}</LockedGroupNesting>
      </LockedScope>
    </View>
  );
}
