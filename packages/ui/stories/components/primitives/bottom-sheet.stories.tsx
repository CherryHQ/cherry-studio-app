import { ChevronRightIcon } from '@cherrystudio/app-icons';
import { BottomSheet } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fn } from 'storybook/test';

type PageKey = 'appearance' | 'root' | 'theme';

const pageTitles: Record<PageKey, string> = {
  appearance: 'Appearance',
  root: 'Settings',
  theme: 'Theme',
};

function BottomSheetPreview() {
  const [isOpen, setIsOpen] = useState(false);
  const [stack, setStack] = useState<readonly PageKey[]>(['root']);
  const pageKey = stack[stack.length - 1] ?? 'root';
  const push = (nextPage: PageKey) => setStack((current) => [...current, nextPage]);
  const pop = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  const close = () => {
    setIsOpen(false);
    setStack(['root']);
  };

  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <BottomSheet onOpenChange={setIsOpen} open={isOpen}>
        <BottomSheet.Trigger accessibilityRole="button" className="rounded-lg bg-primary px-4 py-3">
          <Text className="font-medium text-primary-foreground">Open settings</Text>
        </BottomSheet.Trigger>
        <BottomSheet.Content height={520} onClose={close}>
          <BottomSheet.Header>
            {stack.length > 1 ? (
              <BottomSheet.BackButton accessibilityLabel="Back" onPress={pop} />
            ) : (
              <BottomSheet.CloseButton accessibilityLabel="Close" />
            )}
            <BottomSheet.Title>{pageTitles[pageKey]}</BottomSheet.Title>
            {stack.length > 1 ? (
              <BottomSheet.CloseButton accessibilityLabel="Close" />
            ) : (
              <BottomSheet.HeaderSpacer />
            )}
          </BottomSheet.Header>
          <BottomSheet.PageTransition depth={stack.length - 1} pageKey={pageKey}>
            <SheetPage pageKey={pageKey} push={push} />
          </BottomSheet.PageTransition>
        </BottomSheet.Content>
      </BottomSheet>
    </View>
  );
}

function SheetPage({ pageKey, push }: { pageKey: PageKey; push: (page: PageKey) => void }) {
  if (pageKey === 'root') {
    return (
      <View className="flex-1 px-4 pt-2">
        <SheetRow label="Appearance" onPress={() => push('appearance')} />
      </View>
    );
  }

  if (pageKey === 'appearance') {
    return (
      <View className="flex-1 px-4 pt-2">
        <SheetRow label="Theme" onPress={() => push('theme')} />
      </View>
    );
  }

  return (
    <View className="flex-1 gap-3 px-4 pt-2">
      <Text className="text-base text-foreground">System</Text>
      <Text className="text-base text-muted-foreground">Light</Text>
      <Text className="text-base text-muted-foreground">Dark</Text>
    </View>
  );
}

function SheetRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-row items-center border-border border-b px-1 active:opacity-60"
      onPress={onPress}
    >
      <Text className="min-w-0 flex-1 text-base text-foreground">{label}</Text>
      <ChevronRightIcon className="size-5 text-muted-foreground" />
    </Pressable>
  );
}

const meta = {
  title: 'Components/Primitives/BottomSheet',
  component: BottomSheet,
  args: {
    children: null,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof BottomSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MultiLevel: Story = {
  render: () => <BottomSheetPreview />,
};
