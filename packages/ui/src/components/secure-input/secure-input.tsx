import { EyeIcon, EyeOffIcon } from '@cherrystudio/app-icons';
import { useIsOnSurface } from 'heroui-native/hooks';
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
import { cn } from '../../utils';
import { Button } from '../button';
import { Input } from '../input';
import { useTextField } from '../text-field';
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
  invalid,
  style,
  testID,
  visibilityAccessibilityLabels,
  ...inputProps
}: SecureInputProps) {
  const isOnSurface = useIsOnSurface();
  const textField = useTextField();
  const inputRef = useRef<TextInput>(null);
  const [isVisible, setIsVisible] = useState(false);
  const visibilityProgress = useSharedValue(0);
  const isDisabled = disabled ?? textField?.isDisabled ?? false;
  const isInvalid = invalid ?? textField?.isInvalid ?? false;

  const handleVisibilityToggle = () => {
    if (blurOnVisibilityToggle) {
      inputRef.current?.blur();
    }

    const nextVisibility = !isVisible;
    visibilityProgress.set(withTiming(nextVisibility ? 1 : 0, visibilityIconMotion));
    setIsVisible(nextVisibility);
  };

  return (
    <View
      className={cn(
        // Same height as a plain `Input`: the two sit in adjacent fields of the
        // same form (a provider's name, its Base URL, then its API key), so a
        // secure field that stands taller reads as a different kind of control.
        'min-h-10 flex-row items-stretch overflow-hidden rounded-lg border border-border shadow-none',
        isOnSurface ? 'bg-default' : 'bg-field',
        isDisabled && 'opacity-disabled',
        isInvalid && 'border-destructive',
      )}
      style={[styles.root, style]}
    >
      <Input
        ref={inputRef}
        {...inputProps}
        autoCapitalize="none"
        autoCorrect={false}
        disabled={isDisabled}
        invalid={isInvalid}
        multiline={false}
        secureTextEntry={!isVisible}
        style={styles.input}
        testID={testID}
      />
      <View className="w-11 shrink-0 items-center justify-center">
        <Button
          accessibilityLabel={
            isVisible ? visibilityAccessibilityLabels.hide : visibilityAccessibilityLabels.show
          }
          className="disabled:opacity-100"
          disabled={isDisabled}
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
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    flex: 1,
    // Two less than the frame's own minimum: the frame draws the border, and
    // React Native counts it inside the height.
    minHeight: 38,
    minWidth: 0,
    opacity: 1,
    outlineWidth: 0,
    paddingRight: 0,
  },
  root: {
    borderCurve: 'continuous',
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
