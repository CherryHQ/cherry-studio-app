import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';

export type TabRootHeaderProps = {
  leftActions?: readonly HeaderToolbarAction[];
  rightActions?: readonly HeaderToolbarAction[];
  title: string;
};
