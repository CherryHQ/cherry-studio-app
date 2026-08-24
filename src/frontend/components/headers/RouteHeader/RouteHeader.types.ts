import type { ReactElement } from 'react';

import type { HeaderToolbarAction } from '../components/HeaderAction';

export type RouteHeaderRootAction = 'back' | 'close' | 'drawer';

export type RouteHeaderProps = {
  /** Replaces back navigation for modes that own their own exit behavior. */
  leftActions?: readonly HeaderToolbarAction[];
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  /** Centered native text title used when `titleElement` is not provided. */
  title?: string;
  /** Business-owned interactive content that replaces the native text title. */
  titleElement?: ReactElement;
};
