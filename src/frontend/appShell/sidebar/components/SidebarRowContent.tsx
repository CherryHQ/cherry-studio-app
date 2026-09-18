import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export const SIDEBAR_LEADING_SIZE = 28;

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
}: {
  children: ReactNode;
  className?: string;
  leading?: ReactNode;
}) {
  return (
    <View className={cn('flex-row items-center gap-3 rounded-xl px-3 py-2.5', className)}>
      {leading}
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}
