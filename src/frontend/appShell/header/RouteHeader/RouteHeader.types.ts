import type { ReactElement } from 'react';

import type { HeaderToolbarAction } from '../components/HeaderAction';

/**
 * What leads the root screen of a route stack. `drawer` is the sidebar button: it opens the overlay
 * in a compact window and hides or shows the column in a wide one.
 */
export type RouteHeaderRootAction = 'back' | 'close' | 'drawer';

export type RouteHeaderProps = {
  /** Replaces back navigation for modes that own their own exit behavior. */
  leftActions?: readonly HeaderToolbarAction[];
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  /** Selection mode replaces the page title and actions with a count and one exit. */
  selection?: { onExit: () => void; selectedCount: number };
  /** Centered native text title used when `titleElement` is not provided. */
  title?: string;
  /** Business-owned interactive content that replaces the native text title. */
  titleElement?: ReactElement;
};
