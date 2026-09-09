import { Dialog as HeroDialog } from 'heroui-native';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../button';
import { Input } from '../../../input';
import { TextField } from '../../../text-field';
import type { AlertProps, DialogActionRole } from '../../alert.types';

const buttonVariants: Record<DialogActionRole, 'default' | 'destructive' | 'outline'> = {
  cancel: 'outline',
  default: 'default',
  destructive: 'destructive',
};

export function Alert({
  actions,
  description,
  input,
  isOpen,
  onOpenChange,
  testID,
  title,
}: AlertProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The portal and panel each own 20-point padding; the panel also has a border.
  const maxContentHeight = Math.max(0, height - insets.top - insets.bottom - 82);

  return (
    <HeroDialog isOpen={isOpen} onOpenChange={onOpenChange} testID={testID}>
      <HeroDialog.Portal
        style={{ paddingBottom: insets.bottom + 20, paddingTop: insets.top + 20 }}
        unstable_accessibilityContainerViewIsModal
      >
        <HeroDialog.Overlay className="bg-scrim" isCloseOnPress={false} />
        <HeroDialog.Content
          className="w-full max-w-lg self-center rounded-xl border border-border bg-popover p-5 shadow-none"
          isSwipeable={false}
        >
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: maxContentHeight }}>
            <View className="gap-5">
              <View className="gap-4">
                <View className="gap-1.5">
                  <HeroDialog.Title className="font-semibold text-popover-foreground text-lg">
                    {title}
                  </HeroDialog.Title>
                  {description ? (
                    <HeroDialog.Description className="text-muted-foreground text-base">
                      {description}
                    </HeroDialog.Description>
                  ) : null}
                </View>
                {input ? (
                  <TextField>
                    <Input
                      accessibilityLabel={input.accessibilityLabel}
                      autoFocus={input.autoFocus}
                      maxLength={input.maxLength}
                      onChangeText={input.onChangeText}
                      placeholder={input.placeholder}
                      value={input.value}
                    />
                  </TextField>
                ) : null}
              </View>
              <View className="gap-2">
                {actions.map((action) => (
                  <Button
                    key={`${action.role ?? 'default'}-${action.label}`}
                    onPress={() => {
                      try {
                        action.onPress?.();
                      } finally {
                        onOpenChange(false);
                      }
                    }}
                    size="default"
                    variant={buttonVariants[action.role ?? 'default']}
                  >
                    {action.label}
                  </Button>
                ))}
              </View>
            </View>
          </ScrollView>
        </HeroDialog.Content>
      </HeroDialog.Portal>
    </HeroDialog>
  );
}
