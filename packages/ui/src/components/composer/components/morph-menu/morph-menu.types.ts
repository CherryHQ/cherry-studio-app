import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MorphMenuProps = {
  /** `Composer.Menu.Item`s. They lay out at full size from the first frame — the closed button is a clip window over them, not a smaller version of them. */
  children: ReactNode;
  /** Label of the closed trigger, and of the open panel for screen readers. */
  accessibilityLabel: string;
  /**
   * Floor for the panel's width. Both axes are measured from the children, so
   * content wider than this drives the panel — including content that swaps in
   * while the menu is open, which the panel grows to rather than snapping to.
   * The panel grows up and to the right out of the trigger, so anything near
   * full-screen has to size itself against the window; the menu will not clamp
   * it.
   */
  width?: number;
  /**
   * Overrides the panel's own inset, which is there so rows don't touch the
   * rounded edges. Content that provides its own — a picker, a preview — passes
   * `{ padding: 0 }` and bleeds to them instead.
   */
  contentStyle?: StyleProp<ViewStyle>;
  /** The closed circle, and the footprint it reserves in the parent's flow. Defaults to the toolbar's button size. */
  triggerSize?: number;
  onOpenChange?: (isOpen: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type MorphMenuItemProps = {
  /**
   * Set `false` for an item that leads somewhere inside the menu rather than out
   * of it — the caller then swaps the children and the panel grows to fit.
   */
  closeOnPress?: boolean;
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
