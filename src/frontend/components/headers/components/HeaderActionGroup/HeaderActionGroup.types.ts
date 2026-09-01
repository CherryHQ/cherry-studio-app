import type { HeaderActionTone, HeaderToolbarAction } from '../HeaderAction';

export type HeaderActionGroupProps = {
  actions: readonly HeaderToolbarAction[];
  placement: 'left' | 'right';
  tone?: HeaderActionTone;
};
