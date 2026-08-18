import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';

export type DrawerRootHeaderProps = {
  leftActions?: readonly HeaderToolbarAction[];
  rightActions?: readonly HeaderToolbarAction[];
  title: string;
};
