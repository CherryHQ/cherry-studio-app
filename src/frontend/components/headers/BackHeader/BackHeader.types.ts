import type { StackToolbarButtonProps } from 'expo-router';
import type { ComponentType, ReactElement } from 'react';

type HeaderAndroidIconProps = {
  className?: string;
};

export type HeaderToolbarAction = Pick<
  StackToolbarButtonProps,
  'accessibilityLabel' | 'disabled' | 'hidden' | 'icon' | 'onPress' | 'tintColor' | 'variant'
> & {
  androidIcon?: ComponentType<HeaderAndroidIconProps>;
  /**
   * Custom toolbar content (e.g. a circular avatar), as a single element. When
   * set, the icon fields are ignored: TabRootHeader renders it via
   * `Stack.Toolbar.View` on iOS and a `Fragment` inside `headerRight` on
   * Android. Must have an explicit size.
   */
  element?: ReactElement;
  key: string;
  /**
   * Text rendered in place of the icon, for system-style word buttons such as
   * "Edit". Takes precedence over `icon`/`androidIcon` when set.
   */
  label?: string;
};
