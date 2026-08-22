import type { HeaderToolbarAction } from '../components/HeaderAction';

export type CloseHeaderProps = {
  onClose?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
};
