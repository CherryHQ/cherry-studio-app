import { Dialog as HeroDialog } from 'heroui-native';
import { View } from 'react-native';

import { Button } from '../button';
import type { AlertProps, DialogActionRole } from './alert.types';

const buttonVariants: Record<DialogActionRole, 'default' | 'destructive' | 'outline'> = {
  cancel: 'outline',
  default: 'default',
  destructive: 'destructive',
};

export function Alert({ actions, description, isOpen, onOpenChange, testID, title }: AlertProps) {
  return (
    <HeroDialog isOpen={isOpen} onOpenChange={onOpenChange} testID={testID}>
      <HeroDialog.Portal unstable_accessibilityContainerViewIsModal>
        <HeroDialog.Overlay isCloseOnPress={false} />
        <HeroDialog.Content isSwipeable={false}>
          <View className="gap-1.5">
            <HeroDialog.Title>{title}</HeroDialog.Title>
            {description ? <HeroDialog.Description>{description}</HeroDialog.Description> : null}
          </View>
          <View className="mt-5 flex-row justify-end gap-3">
            {actions.map((action) => (
              <Button
                key={`${action.role ?? 'default'}-${action.label}`}
                onPress={() => {
                  onOpenChange(false);
                  action.onPress?.();
                }}
                size="sm"
                variant={buttonVariants[action.role ?? 'default']}
              >
                {action.label}
              </Button>
            ))}
          </View>
        </HeroDialog.Content>
      </HeroDialog.Portal>
    </HeroDialog>
  );
}
