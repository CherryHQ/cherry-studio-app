import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fn } from 'storybook/test';

function BottomSheetPreview() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const close = () => {
    setIsOpen(false);
    setIsDetailOpen(false);
  };

  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Button onPress={() => setIsOpen(true)}>Open sheet</Button>
      <BottomSheet
        backAction={
          isDetailOpen
            ? { accessibilityLabel: 'Back', onPress: () => setIsDetailOpen(false) }
            : undefined
        }
        footer={!isDetailOpen ? <Button onPress={close}>Done</Button> : undefined}
        onClose={close}
        open={isOpen}
        size={isDetailOpen ? 'compact' : 'medium'}
        title={isDetailOpen ? 'Appearance' : 'Settings'}
      >
        {isDetailOpen ? (
          <View className="gap-4 px-6 pt-2">
            <Text className="text-lg text-foreground">System</Text>
            <Text className="text-lg text-muted-foreground">Light</Text>
            <Text className="text-lg text-muted-foreground">Dark</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            className="min-h-14 flex-row items-center px-6 active:opacity-60"
            onPress={() => setIsDetailOpen(true)}
          >
            <Text className="min-w-0 flex-1 text-lg text-foreground">Appearance</Text>
            <ChevronRightIcon className="size-5 text-muted-foreground" />
          </Pressable>
        )}
      </BottomSheet>
    </View>
  );
}

const meta = {
  title: 'Components/Primitives/BottomSheet',
  component: BottomSheet,
  args: {
    children: null,
    onClose: fn(),
    open: false,
    size: 'medium',
    title: 'Sheet title',
  },
} satisfies Meta<typeof BottomSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <BottomSheetPreview />,
};
