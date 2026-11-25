import type { ReactElement, ReactNode } from 'react';

import type { MenuItem } from '../menu/menu.types';

export type SortableReorderEvent = {
  fromIndex: number;
  groupId: string;
  groupSize?: number;
  id: string;
  toIndex: number;
};

export type SortableScrollController = {
  getOffset: () => number;
  scrollTo: (offset: number, animated?: boolean) => void;
};

export type SortableAccessibilityLabels = {
  moveDown?: string;
  moveToTop?: string;
  moveUp?: string;
};

export type SortableRootProps = {
  children: ReactNode | ((state: { isDragging: boolean }) => ReactNode);
  onDraggingChange?: (isDragging: boolean) => void;
  scrollController?: SortableScrollController;
  testID?: string;
};

export type SortableGroupProps = {
  children?: ReactNode;
  estimatedItemHeight: number;
  groupId: string;
  itemIds: readonly string[];
  onReorder: (event: SortableReorderEvent) => void;
};

export type SortableChromeProps = {
  children: ReactNode;
  className?: string;
  groupId?: string;
  testID?: string;
};

export type SortableItemProps = {
  accessibilityLabels?: SortableAccessibilityLabels;
  children: ReactElement;
  disabled?: boolean;
  estimatedHeight?: number;
  groupId: string;
  groupSize?: number;
  id: string;
  index: number;
  menuItems?: readonly MenuItem[];
  movable?: boolean;
  renderOverlay?: () => ReactNode;
  testID?: string;
};
