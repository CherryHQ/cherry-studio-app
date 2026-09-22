import { Dialog as HeroDialog } from 'heroui-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { usePortalBackgroundIsolation } from '../portal/portal-accessibility';

export type DialogProps = {
  children: ReactNode;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  testID?: string;
  title: string;
};

/** A controlled decision surface; caller-owned actions determine when it closes. */
export function Dialog({ children, onOpenChange, open, testID, title }: DialogProps) {
  usePortalBackgroundIsolation(open);

  return (
    <HeroDialog isOpen={open} onOpenChange={onOpenChange} testID={testID}>
      <HeroDialog.Portal unstable_accessibilityContainerViewIsModal>
        <HeroDialog.Overlay className="bg-scrim" isCloseOnPress={false} />
        <HeroDialog.Content
          className="max-h-full w-full max-w-sm self-center border border-border-subtle bg-popover p-6"
          isSwipeable={false}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View className="gap-4">
              <HeroDialog.Title className="font-semibold text-foreground text-lg">
                {title}
              </HeroDialog.Title>
              {children}
            </View>
          </ScrollView>
        </HeroDialog.Content>
      </HeroDialog.Portal>
    </HeroDialog>
  );
}
