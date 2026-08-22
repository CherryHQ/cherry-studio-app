import type { ReactElement } from 'react';

import type { HeaderToolbarAction } from '../HeaderAction';

export type HeaderChromeProps = {
  leftActions: readonly HeaderToolbarAction[];
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
  titleAlign?: 'center' | 'left';
  titleElement?: ReactElement;
};
