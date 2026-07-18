import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';

export type TabRootHeaderProps = {
  rightActions?: readonly HeaderToolbarAction[];
  title: string;
};
