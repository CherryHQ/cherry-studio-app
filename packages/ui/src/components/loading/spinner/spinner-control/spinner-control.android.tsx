import { Spinner as HeroSpinner } from 'heroui-native/spinner';
import { ActivityIndicator, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import type { SpinnerControlProps } from './spinner-control.types';

const dimensions = { default: 24, lg: 32, sm: 16 } as const;
const heroSize = { default: 'md', lg: 'lg', sm: 'sm' } as const;

export function SpinnerControl({
  color = 'default',
  size = 'default',
  style,
  ...props
}: SpinnerControlProps) {
  const reducedMotion = useReducedMotion();
  const [primary, success, warning, danger] = useCSSVariable([
    '--color-primary',
    '--color-success',
    '--color-warning',
    '--color-destructive',
  ]);
  const colors: Record<string, unknown> = { default: primary, success, warning, danger };
  const resolvedColor = colors[color] ?? color;
  const dimension = dimensions[size];

  if (reducedMotion) {
    return (
      <HeroSpinner
        {...props}
        color={color}
        size={heroSize[size]}
        style={style}
        animation="disable-all"
      />
    );
  }

  // Native indeterminate progress does not submit a Fabric ShadowTree every frame.
  // Reanimated rotation can starve concurrent native state commits while history mounts.
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      {...props}
      style={[
        { width: dimension, height: dimension, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <ActivityIndicator
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        color={typeof resolvedColor === 'string' ? resolvedColor : undefined}
        size={dimension}
      />
    </View>
  );
}
