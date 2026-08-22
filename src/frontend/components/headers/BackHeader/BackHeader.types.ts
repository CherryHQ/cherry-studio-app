import type { ReactElement } from 'react';

import type { HeaderToolbarAction } from '../components/HeaderAction';

export type BackHeaderProps = {
  /** Replaces back navigation for modes that own their own exit behavior. */
  leftActions?: readonly HeaderToolbarAction[];
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
  titleElement?: ReactElement;
};

export type { HeaderToolbarAction } from '../components/HeaderAction';
