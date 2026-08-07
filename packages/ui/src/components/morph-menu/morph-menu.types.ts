import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MorphMenuProps = {
  /** `MorphMenu.Item`s. They lay out at full size from the first frame — the closed button is a clip window over them, not a smaller version of them. */
  children: ReactNode;
  /** Label of the closed trigger, and of the open panel for screen readers. */
  accessibilityLabel: string;
  /** Panel width. Height is measured from the children so the item count drives it. */
  width?: number;
  /** The closed circle, and the footprint it reserves in the parent's flow. */
  triggerSize?: number;
  onOpenChange?: (isOpen: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type MorphMenuItemProps = {
  /** Rendered before the label; size it via className on the icon itself. */
  icon?: ReactNode;
  label: string;
  /** The menu closes itself before this fires, so callers don't have to. */
  onPress: () => void;
  testID?: string;
};
