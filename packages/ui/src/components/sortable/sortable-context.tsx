import { createContext, type ReactNode, use } from 'react';
import type { ViewInstance } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { MenuItem } from '../menu/menu.types';
import type { SortableReorderEvent } from './sortable.types';

export type SortableGroupRegistration = {
  estimatedItemHeight: number;
  groupId: string;
  itemIds: readonly string[];
  onReorder: (event: SortableReorderEvent) => void;
  token: symbol;
};

export type SortableActivatePayload = {
  estimatedHeight?: number;
  groupId: string;
  id: string;
  index: number;
  measuredHeight: number;
  measuredWidth: number;
  menuItems: readonly MenuItem[];
  movable: boolean;
  renderOverlay: () => ReactNode;
  view: ViewInstance | null;
};

export type SortableContextValue = {
  activateLongPress: (payload: SortableActivatePayload) => void;
  activeGroupIdSV: SharedValue<string | null>;
  activeHeightSV: SharedValue<number>;
  activeIdSV: SharedValue<string | null>;
  activeIndexSV: SharedValue<number>;
  commitAccessibilityMove: (
    groupId: string,
    id: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  dragOffsetYSV: SharedValue<number>;
  finishGesture: (success: boolean) => void;
  getGroupItemCount: (groupId: string) => number;
  hoverIndexSV: SharedValue<number>;
  lastSettledIdSV: SharedValue<string | null>;
  liftProgressSV: SharedValue<number>;
  notifyItemCommitted: (groupId: string, id: string, index: number) => void;
  registerGroup: (registration: SortableGroupRegistration) => void;
  reportItemHeight: (groupId: string, id: string, height: number) => void;
  unregisterGroup: (groupId: string, token: symbol) => void;
  updateDrag: (translationX: number, translationY: number, absoluteY: number) => void;
};

export type SortableGroupContextValue = {
  groupId: string;
  groupSize: number;
};

export const SortableGroupContext = createContext<SortableGroupContextValue | null>(null);

export function useSortableGroupContext(): SortableGroupContextValue | null {
  return use(SortableGroupContext);
}

export const SortableContext = createContext<SortableContextValue | null>(null);

export function useSortableContext(): SortableContextValue | null {
  return use(SortableContext);
}
