import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { createAnimatedComponent, useAnimatedProps } from 'react-native-reanimated';

import { DynamicToastContentBase } from './inner-base';
import type { DynamicToastContentProps, DynamicToastContentVariant } from './inner.types';
import { useDynamicToast } from './provider';

const AnimatedBlurView = createAnimatedComponent(BlurView);

type IosContentProps = DynamicToastContentProps & {
  variant: DynamicToastContentVariant;
};

function IosContent({ variant, ...props }: IosContentProps) {
  const {
    meta: { expansionProgress },
  } = useDynamicToast();
  const isCollapsed = variant === 'collapsed';
  const animatedProps = useAnimatedProps(() => {
    const expansion = expansionProgress.get();
    const hiddenProgress = isCollapsed ? expansion : 1 - expansion;

    return { intensity: hiddenProgress * 30 };
  });

  return (
    <DynamicToastContentBase
      {...props}
      backdrop={
        <AnimatedBlurView
          animatedProps={animatedProps}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      }
      variant={variant}
    />
  );
}

export function Collapsed(props: DynamicToastContentProps) {
  return <IosContent {...props} variant="collapsed" />;
}

export function Expanded(props: DynamicToastContentProps) {
  return <IosContent {...props} variant="expanded" />;
}
