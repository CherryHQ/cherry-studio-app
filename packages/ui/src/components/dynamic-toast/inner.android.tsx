import { DynamicToastContentBase } from './inner-base';
import type { DynamicToastContentProps } from './inner.types';

export function Collapsed(props: DynamicToastContentProps) {
  return <DynamicToastContentBase {...props} variant="collapsed" />;
}

export function Expanded(props: DynamicToastContentProps) {
  return <DynamicToastContentBase {...props} variant="expanded" />;
}
