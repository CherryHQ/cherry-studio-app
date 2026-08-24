import { cn } from '@cherrystudio/ui/utils';
import type { PropsWithChildren } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { RouteHeader, type RouteHeaderProps } from '@/frontend/components/headers';

type SettingsScrollPageProps = PropsWithChildren<
  Pick<
    ScrollViewProps,
    'contentInsetAdjustmentBehavior' | 'keyboardDismissMode' | 'keyboardShouldPersistTaps'
  > & {
    contentClassName?: string;
    headerProps: RouteHeaderProps;
  }
>;

export function SettingsScrollPage({
  children,
  contentClassName,
  contentInsetAdjustmentBehavior = 'automatic',
  headerProps,
  keyboardDismissMode,
  keyboardShouldPersistTaps,
}: SettingsScrollPageProps) {
  return (
    <>
      <RouteHeader {...headerProps} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName={cn('px-4 py-5', contentClassName)}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </>
  );
}
