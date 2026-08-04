import { Alert as ExpoAlert, Button, Host, Spacer, Text } from '@expo/ui/swift-ui';
import { useUniwind } from 'uniwind';

import type { AlertProps } from './alert.types';

export function Alert({ actions, description, isOpen, onOpenChange, testID, title }: AlertProps) {
  const { theme } = useUniwind();

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
