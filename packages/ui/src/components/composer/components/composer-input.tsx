import { TextInput } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { useComposerActions, useComposerState } from '../composer.context';
import { textInputBoxStyle } from '../composer.layout';
import type { ComposerInputProps } from '../composer.types';
import { composerTextStyle } from '../composerTextStyle';

const inputStyle = { ...textInputBoxStyle, ...composerTextStyle };

/** The text field, growing with its content up to a capped height. */
export function ComposerInput({
  autoFocus = false,
  placeholder,
  ref,
  style,
  testID,
}: ComposerInputProps) {
  const { value } = useComposerState('Composer.Input');
  const { changeText } = useComposerActions('Composer.Input');
  const placeholderStyle = useResolveClassNames('text-muted-foreground');

  return (
    <TextInput
      autoFocus={autoFocus}
      className="text-base text-foreground"
      multiline
      onChangeText={changeText}
      placeholder={placeholder}
      placeholderTextColor={
        typeof placeholderStyle.color === 'string' ? placeholderStyle.color : undefined
      }
      ref={ref}
      style={[inputStyle, style]}
      testID={testID}
      value={value}
    />
  );
}

ComposerInput.displayName = 'Composer.Input';
