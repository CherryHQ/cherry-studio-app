import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import EyeOffIcon from '@cherrystudio/app-icons/icons/eye-off';
import { useIsOnSurface } from 'heroui-native/hooks';
import { Input as HeroInput } from 'heroui-native/input';
import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  type TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { duration, easing } from '../../motion';
import { cn } from '../../utils';
import { Button } from '../button';
import { useTextField } from '../text-field';
import type { InputPasswordProps, InputProps, InputTextProps } from './input.types';

const multilineVisibleLines = 4;
const multilineVerticalPadding = 16;
const fallbackBaseLineHeight = 24;
const blurredSelection = { end: 0, start: 0 } as const;
const visibilityIconMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

type NativeInputProps = InputTextProps & {
  secureTextEntry?: boolean;
};

function resolveCSSNumber(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }

  const parsedValue = typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function NativeInput({
  accessibilityLabel,
  allowFontScaling = true,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoFocus = false,
  disabled,
  invalid,
  keyboardType,
  multiline = false,
  maxFontSizeMultiplier,
  onChangeText,
  ref,
  returnKeyType,
  scrollEnabled,
  secureTextEntry = false,
  style,
  testID,
  type: _type,
  value,
  ...inputProps
}: NativeInputProps) {
  const baseLineHeight = resolveCSSNumber(
    useCSSVariable('--ui-text-base--line-height'),
    fallbackBaseLineHeight,
  );
  const { fontScale } = useWindowDimensions();
  const cappedFontScale =
    maxFontSizeMultiplier && maxFontSizeMultiplier >= 1
      ? Math.min(fontScale, maxFontSizeMultiplier)
      : fontScale;
  const effectiveFontScale = allowFontScaling ? cappedFontScale : 1;
  const multilineHeight = Math.ceil(
    baseLineHeight * effectiveFontScale * multilineVisibleLines + multilineVerticalPadding,
  );
  const inputClassName = cn(
    multiline
      ? 'min-h-10 rounded-lg border border-border py-2 text-base shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
      : 'min-h-10 rounded-lg border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border',
    invalid &&
      'border-destructive ios:outline-danger ios:focus:outline-danger android:border-destructive android:focus:border-destructive',
  );

  return (
    <HeroInput
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={allowFontScaling}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      autoFocus={autoFocus}
      className={inputClassName}
      isDisabled={disabled}
      isInvalid={invalid}
      {...inputProps}
      keyboardType={keyboardType}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      multiline={multiline}
      onChangeText={onChangeText}
      returnKeyType={returnKeyType}
      scrollEnabled={scrollEnabled ?? (multiline ? true : undefined)}
      secureTextEntry={secureTextEntry}
      style={multiline ? [{ height: multilineHeight }, style] : style}
      testID={testID}
      value={value}
    />
  );
}

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

function PasswordInput({
  blurOnVisibilityToggle = false,
  disabled,
  invalid,
  ref,
  style,
  testID,
  type: _type,
  visibilityAccessibilityLabels,
  ...inputProps
}: InputPasswordProps) {
  const isOnSurface = useIsOnSurface();
  const textField = useTextField();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const visibilityProgress = useSharedValue(0);
  const isDisabled = disabled ?? textField?.isDisabled ?? false;
  const isInvalid = invalid ?? textField?.isInvalid ?? false;
  const { onBlur, onFocus, ...restInputProps } = inputProps;
  const handleInputRef = useCallback(
    (node: TextInput | null) => {
      inputRef.current = node;

      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

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
        // password field that stands taller reads as a different kind of control.
        'min-h-10 flex-row items-stretch overflow-hidden rounded-lg border border-border shadow-none',
        isOnSurface ? 'bg-default' : 'bg-field',
        isDisabled && 'opacity-disabled',
        isInvalid && 'border-destructive',
      )}
      style={[styles.root, style]}
    >
      <View className="min-w-0 flex-1 overflow-hidden">
        <NativeInput
          ref={handleInputRef}
          {...restInputProps}
          autoCapitalize="none"
          autoCorrect={false}
          disabled={isDisabled}
          invalid={isInvalid}
          multiline={false}
          onBlur={handleBlur}
          onFocus={handleFocus}
          secureTextEntry={!isVisible}
          selection={isFocused ? undefined : blurredSelection}
          style={styles.input}
          testID={testID}
        />
      </View>
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

export function Input(props: InputProps) {
  return props.type === 'password' ? <PasswordInput {...props} /> : <NativeInput {...props} />;
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
