import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';

import type { ContextMenuViewProps } from './ContextMenuView.types';

export const ContextMenuView = requireNativeViewManager(
  'ContextMenu',
) as ComponentType<ContextMenuViewProps>;
