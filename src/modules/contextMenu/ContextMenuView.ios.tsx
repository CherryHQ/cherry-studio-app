import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { ContextMenuViewProps } from './ContextMenuView.types';

export const ContextMenuView = requireNativeView(
  'ContextMenu',
) as ComponentType<ContextMenuViewProps>;
