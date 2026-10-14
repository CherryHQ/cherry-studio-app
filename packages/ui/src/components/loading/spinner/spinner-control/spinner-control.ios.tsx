import { Spinner as HeroSpinner } from 'heroui-native/spinner';

import type { SpinnerControlProps } from './spinner-control.types';

const heroSize = { default: 'md', lg: 'lg', sm: 'sm' } as const;

export function SpinnerControl({ size = 'default', ...props }: SpinnerControlProps) {
  return <HeroSpinner {...props} size={heroSize[size]} />;
}
