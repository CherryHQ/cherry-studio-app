import { AndroidDialog } from '../android-dialog';
import type { AlertProps } from './alert.types';

export function Alert(props: AlertProps) {
  return <AndroidDialog {...props} />;
}
