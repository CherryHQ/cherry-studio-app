import { cn } from '@cherrystudio/ui/utils';
import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { RouteHeader, type RouteHeaderProps } from '@/frontend/components/headers';

type SettingsScrollPageProps = PropsWithChildren<
  Pick<
    ScrollViewProps,
    'contentInsetAdjustmentBehavior' | 'keyboardDismissMode' | 'keyboardShouldPersistTaps'
  > & {
    contentClassName?: string;
    headerProps: RouteHeaderProps;
    /**
     * An `InlineSearch` for pages that filter their own content.
     *
     * It sits outside the scroll view on purpose: iOS mounts it into the native
     * header, and Android draws a row that has to stay put while the content
     * below it scrolls.
     */
    search?: ReactNode;
  }
>;

export function SettingsScrollPage({
  children,
  contentClassName,
  contentInsetAdjustmentBehavior = 'automatic',
  headerProps,
  keyboardDismissMode,
  keyboardShouldPersistTaps,
  search,
}: SettingsScrollPageProps) {
  return (
    <>
      <RouteHeader {...headerProps} />
      {search}
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
