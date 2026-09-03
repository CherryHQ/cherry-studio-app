import type { ReactElement } from 'react';

import type { HeaderActionTone, HeaderToolbarAction } from '../HeaderAction';

export type HeaderChromeProps = {
  actionTone?: HeaderActionTone;
  leftActions: readonly HeaderToolbarAction[];
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
  titleAlign?: 'center' | 'left';
  titleElement?: ReactElement;
};
