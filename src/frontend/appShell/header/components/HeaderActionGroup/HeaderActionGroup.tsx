import type { HeaderActionTone, HeaderToolbarAction } from '../HeaderAction';

export type HeaderActionGroupProps = {
  actions: readonly HeaderToolbarAction[];
  placement: 'left' | 'right';
  tone?: HeaderActionTone;
};

// Platform resolver: Metro selects the matching native toolbar adapter.
export { HeaderActionGroup } from './HeaderActionGroup.android';
