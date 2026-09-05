import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MorphMenuProps = {
  /** `Composer.Menu.Item`s. They lay out at full size from the first frame — the closed button is a clip window over them, not a smaller version of them. */
  children: ReactNode;
  /** Label of the closed trigger, and of the open panel for screen readers. */
  accessibilityLabel: string;
  /**
   * Floor for the panel's width. Both axes are measured from the children, so
   * content wider than this drives the panel. Defaults to 60% of the screen.
   */
  width?: number;
  /** The closed circle, and the footprint it reserves in the parent's flow. Defaults to the toolbar's button size. */
  triggerSize?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type MorphMenuItemProps = {
  /** Rendered before the label; size it via className on the icon itself. */
  icon?: ReactNode;
  label: string;
  /** The menu closes itself before this fires, so callers don't have to. */
  onPress: () => void;
  /** Announced to assistive tech. What it looks like selected is the caller's, via `icon` and `trailing`. */
  selected?: boolean;
  testID?: string;
  /** Rendered after the label, pushed to the row's end — a checkmark, a value, a chevron. */
  trailing?: ReactNode;
};

export type MorphMenuToggleProps = {
  disabled?: boolean;
  /** Rendered before the label; size it via className on the icon itself. */
  icon?: ReactNode;
  label: string;
  /** The menu closes itself before this fires, same as an item's `onPress`. */
  onValueChange: (value: boolean) => void;
  testID?: string;
  value: boolean;
};
