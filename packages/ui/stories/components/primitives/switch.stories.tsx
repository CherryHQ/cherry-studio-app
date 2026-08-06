import { Switch, type SwitchProps, type SwitchSize } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

const sizes: SwitchSize[] = ['sm', 'default', 'lg'];

type ThemePreviewProps = {
  args: SwitchProps;
  label: string;
  theme: 'dark' | 'light';
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);

  useEffect(() => setValue(args.value), [args.value]);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-base text-foreground">Default</Text>
          <Switch
            {...args}
            onValueChange={(nextValue) => {
              setValue(nextValue);
              args.onValueChange(nextValue);
            }}
            value={value}
          />
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-base text-foreground">Disabled</Text>
          <Switch {...args} disabled value={value} />
        </View>
        <Text className="text-sm font-medium text-muted-foreground">Sizes</Text>
        {sizes.map((size) => (
          <View className="flex-row items-center justify-between gap-4" key={size}>
            <Text className="text-base text-foreground">{size}</Text>
            <Switch {...args} size={size} value={value} />
          </View>
        ))}
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Switch',
  component: Switch,
  args: {
    accessibilityLabel: 'Setting',
    disabled: false,
    onValueChange: fn(),
    size: 'default',
    value: true,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    size: { control: 'select', options: sizes },
    value: { control: 'boolean' },
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
} satisfies Meta<typeof Switch>;

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
