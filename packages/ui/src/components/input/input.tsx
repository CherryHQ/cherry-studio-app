import { Input as HeroInput } from 'heroui-native/input';
import { TextField } from 'heroui-native/text-field';
import { cn } from 'heroui-native/utils';
import { forwardRef } from 'react';
import { type TextInput, useWindowDimensions } from 'react-native';
import { useCSSVariable } from 'uniwind';

import type { InputProps } from './input.types';

const multilineVisibleLines = 4;
const multilineVerticalPadding = 16;
const fallbackBaseLineHeight = 24;

function resolveCSSNumber(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }

  const parsedValue = typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    accessibilityLabel,
    allowFontScaling = true,
    autoCapitalize = 'sentences',
    autoCorrect = true,
    autoFocus = false,
    disabled = false,
    invalid = false,
    keyboardType,
    multiline = false,
    maxFontSizeMultiplier,
    onChangeText,
    returnKeyType,
    scrollEnabled,
    secureTextEntry = false,
    style,
    testID,
    value,
    ...inputProps
  },
  ref,
) {
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
      'border-danger ios:outline-danger ios:focus:outline-danger android:border-danger android:focus:border-danger',
  );

  return (
    <TextField
      isDisabled={disabled}
      isInvalid={invalid}
      testID={testID ? `${testID}-field` : undefined}
    >
      <HeroInput
        ref={ref}
        accessibilityLabel={accessibilityLabel}
        allowFontScaling={allowFontScaling}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        className={inputClassName}
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
    </TextField>
  );
});
