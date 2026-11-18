import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export const SIDEBAR_LEADING_SIZE = 28;
/** Shared row geometry used by the branch rail as well as ordinary row content. */
export const SIDEBAR_ROW_INSET = 12;
export const SIDEBAR_ROW_GAP = 12;

/** Only Agent groups reserve an icon column; ordinary conversation rows have no leading slot. */
export function SidebarAgentIconSlot({ children }: { children?: ReactNode }) {
  return (
    <View className="shrink-0 items-center" style={{ width: SIDEBAR_LEADING_SIZE }}>
      {children}
    </View>
  );
}

export function SidebarRowContent({
  children,
  className,
  leading,
  trailingInset = SIDEBAR_ROW_INSET,
}: {
  children: ReactNode;
  className?: string;
  leading?: ReactNode;
  trailingInset?: number;
}) {
  return (
    <View
      className={cn('flex-row items-center rounded-xl', className)}
      style={{
        gap: SIDEBAR_ROW_GAP,
        paddingLeft: SIDEBAR_ROW_INSET,
        paddingRight: trailingInset,
        paddingVertical: 10,
      }}
    >
      {leading}
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}
