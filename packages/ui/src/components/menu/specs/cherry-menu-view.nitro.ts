import type { HybridView, HybridViewMethods, HybridViewProps } from 'react-native-nitro-modules';

export type NativeMenuCheckedState = 'none' | 'off' | 'on';

/**
 * Semantic leading-glyph token, resolved per platform inside the native view.
 * The contract never carries a platform symbol name, so iOS may use an SF
 * Symbol while Android uses a bundled vector drawable.
 */
export type NativeMenuIcon = 'none' | 'branch';

export interface NativeMenuItem {
  checked: NativeMenuCheckedState;
  destructive: boolean;
  disabled: boolean;
  icon: NativeMenuIcon;
  id: string;
  label: string;
}

export type NativeMenuTrigger = 'tap' | 'longPress';

export interface CherryMenuViewProps extends HybridViewProps {
  items: NativeMenuItem[];
  onAction: (id: string) => void;
  trigger: NativeMenuTrigger;
}

export interface CherryMenuViewMethods extends HybridViewMethods {}

export type CherryMenuView = HybridView<CherryMenuViewProps, CherryMenuViewMethods>;
