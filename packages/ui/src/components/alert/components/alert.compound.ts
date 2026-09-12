import { AlertProvider } from './alert-provider';
import { Alert as AlertPrimitive } from './alert/alert';

export const Alert = Object.assign(AlertPrimitive, {
  Provider: AlertProvider,
});
