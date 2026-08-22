import type { HeaderToolbarAction } from '../components/HeaderAction';

export type DrawerRootHeaderProps = {
  leftActions?: readonly HeaderToolbarAction[];
  rightActions?: readonly HeaderToolbarAction[];
  title: string;
};
