import { Alert, Button, type AlertProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

type ThemePreviewProps = {
  args: AlertProps;
  label: string;
  theme: 'dark' | 'light';
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [isOpen, setIsOpen] = useState(args.isOpen);

  useEffect(() => setIsOpen(args.isOpen), [args.isOpen]);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <Button onPress={() => setIsOpen(true)}>Show alert</Button>
        <Alert
          {...args}
          isOpen={isOpen}
          onOpenChange={(nextIsOpen) => {
            setIsOpen(nextIsOpen);
            args.onOpenChange(nextIsOpen);
          }}
        />
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Alert',
  component: Alert,
  args: {
    actions: [
      { label: 'Cancel', role: 'cancel' },
      { label: 'Confirm', onPress: fn(), role: 'default' },
    ],
    description: 'Your changes will be applied.',
    isOpen: false,
    onOpenChange: fn(),
    title: 'Apply changes?',
  },
  argTypes: {
    actions: { control: false },
    description: { control: 'text' },
    isOpen: { control: 'boolean' },
    title: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4 p-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
