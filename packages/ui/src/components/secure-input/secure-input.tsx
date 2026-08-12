// Metro resolves this workspace package export; ESLint's import resolver does not.
// eslint-disable-next-line import/no-unresolved
import { EyeIcon, EyeOffIcon } from 'lucide-uniwind/png';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';

import { Button } from '../button';
import { Input } from '../input';
import type { SecureInputProps } from './secure-input.types';

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

  const handleVisibilityToggle = () => {
    if (blurOnVisibilityToggle) {
      inputRef.current?.blur();
    }

    setIsVisible((visible) => !visible);
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
          icon={isVisible ? <EyeIcon /> : <EyeOffIcon />}
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
});
