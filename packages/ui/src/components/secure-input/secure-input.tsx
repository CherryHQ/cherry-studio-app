// Metro resolves this workspace package export; ESLint's import resolver does not.
// eslint-disable-next-line import/no-unresolved
import { EyeIcon, EyeOffIcon } from 'lucide-uniwind/png';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';
import Animated, {
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing } from '../../motion';
import { Button } from '../button';
import { Input } from '../input';
import type { SecureInputProps } from './secure-input.types';

const visibilityIconMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

function VisibilityIcon({
  className,
  progress,
}: {
  className?: string;
  progress: SharedValue<number>;
}) {
  const hiddenStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
  }));
  const visibleStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  return (
    <View className={className} style={styles.visibilityIcon}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.visibilityIconLayer, hiddenStyle]}
      >
        <EyeOffIcon className={className} />
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.visibilityIconLayer, visibleStyle]}
      >
        <EyeIcon className={className} />
      </Animated.View>
    </View>
  );
}

export function SecureInput({
  blurOnVisibilityToggle = false,
  disabled,
  style,
  testID,
  visibilityAccessibilityLabels,
  ...inputProps
}: SecureInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [isVisible, setIsVisible] = useState(false);
  const visibilityProgress = useSharedValue(0);

  const handleVisibilityToggle = () => {
    if (blurOnVisibilityToggle) {
      inputRef.current?.blur();
    }

    const nextVisibility = !isVisible;
    visibilityProgress.set(withTiming(nextVisibility ? 1 : 0, visibilityIconMotion));
    setIsVisible(nextVisibility);
  };

  return (
    <View className="relative">
      <Input
        ref={inputRef}
        {...inputProps}
        autoCapitalize="none"
        autoCorrect={false}
        disabled={disabled}
        multiline={false}
        secureTextEntry={!isVisible}
        style={[style, styles.input]}
        testID={testID}
      />
      <View
        className="absolute top-0 right-1 bottom-0 z-10 w-11 items-center justify-center"
        pointerEvents="box-none"
      >
        <Button
          accessibilityLabel={
            isVisible ? visibilityAccessibilityLabels.hide : visibilityAccessibilityLabels.show
          }
          disabled={disabled}
          hitSlop={6}
          icon={<VisibilityIcon progress={visibilityProgress} />}
          onPress={handleVisibilityToggle}
          size="sm"
          testID={testID ? `${testID}-visibility-toggle` : undefined}
          variant="ghost"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    paddingRight: 48,
  },
  visibilityIcon: {
    position: 'relative',
  },
  visibilityIconLayer: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
