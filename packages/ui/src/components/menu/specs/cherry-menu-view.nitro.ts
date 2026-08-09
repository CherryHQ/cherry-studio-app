import type { HybridView, HybridViewMethods, HybridViewProps } from 'react-native-nitro-modules';

export type NativeMenuCheckedState = 'none' | 'off' | 'on';

export interface NativeMenuItem {
  checked: NativeMenuCheckedState;
  destructive: boolean;
  disabled: boolean;
  id: string;
  label: string;
  systemImage?: string;
}

export type NativeMenuTrigger = 'tap' | 'longPress';

export interface CherryMenuViewProps extends HybridViewProps {
  items: NativeMenuItem[];
  onAction: (id: string) => void;
  trigger: NativeMenuTrigger;
}

export interface CherryMenuViewMethods extends HybridViewMethods {}

export type CherryMenuView = HybridView<CherryMenuViewProps, CherryMenuViewMethods>;
