import {
  Alert as ExpoAlert,
  Button,
  Host,
  Spacer,
  Text,
  TextField as ExpoTextField,
  useNativeState,
} from '@expo/ui/swift-ui';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { useUniwind } from 'uniwind';

import type { AlertProps } from '../../alert.types';

export function Alert({
  actions,
  description,
  input,
  isOpen,
  onOpenChange,
  testID,
  title,
}: AlertProps) {
  const { theme } = useUniwind();
  const inputValue = input?.value ?? '';
  const nativeInputValue = useNativeState(inputValue);

  useEffect(() => {
    if (nativeInputValue.get() !== inputValue) {
      nativeInputValue.set(inputValue);
    }
  }, [inputValue, nativeInputValue]);

  return (
    <Host colorScheme={theme === 'dark' ? 'dark' : 'light'} matchContents>
      <ExpoAlert
        isPresented={isOpen}
        onIsPresentedChange={onOpenChange}
        testID={testID}
        title={title}
      >
        <ExpoAlert.Trigger>
          <Spacer minLength={0} />
        </ExpoAlert.Trigger>
        <ExpoAlert.Actions>
          {input ? (
            <ExpoTextField
              autoFocus={input.autoFocus}
              maxLength={input.maxLength}
              modifiers={[accessibilityLabelModifier(input.accessibilityLabel)]}
              onTextChange={input.onChangeText}
              placeholder={input.placeholder}
              text={nativeInputValue}
            />
          ) : null}
          {actions.map((action) => (
            <Button
              key={`${action.role ?? 'default'}-${action.label}`}
              label={action.label}
              onPress={action.onPress}
              role={action.role ?? 'default'}
            />
          ))}
        </ExpoAlert.Actions>
        {description ? (
          <ExpoAlert.Message>
            <Text>{description}</Text>
          </ExpoAlert.Message>
        ) : null}
      </ExpoAlert>
    </Host>
  );
}
