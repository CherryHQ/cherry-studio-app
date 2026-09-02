import { Slider, type SliderProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;
const noop = () => undefined;

type ThemePreviewProps = {
  args: SliderProps;
  label: string;
  theme: 'dark' | 'light';
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-foreground">{label}</Text>
          <Text className="text-sm tabular-nums text-muted-foreground">{value}</Text>
        </View>
        <Slider
          {...args}
          onValueChange={(nextValue) => {
            setValue(nextValue);
            args.onValueChange(nextValue);
          }}
          value={value}
        />
        <View className="gap-2">
          <Text className="font-medium text-muted-foreground text-sm">Compact range</Text>
          <Slider
            accessibilityLabel="Opacity"
            max={1}
            min={0}
            onValueChange={noop}
            step={0.1}
            value={0.4}
          />
        </View>
        <View className="gap-2">
          <Text className="font-medium text-muted-foreground text-sm">Disabled</Text>
          <Slider accessibilityLabel="Disabled value" disabled onValueChange={noop} value={65} />
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Slider',
  component: Slider,
  args: {
    accessibilityLabel: 'Value',
    disabled: false,
    max: 100,
    maximumValueLabel: 'Maximum',
    min: 0,
    minimumValueLabel: 'Minimum',
    onValueChange: fn(),
    step: 1,
    value: 50,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    max: { control: 'number' },
    maximumValueLabel: { control: 'text' },
    min: { control: 'number' },
    minimumValueLabel: { control: 'text' },
    step: { control: 'number' },
    value: { control: 'number' },
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
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview
          args={args}
          key={`${theme.value}-${args.value}`}
          label={theme.label}
          theme={theme.value}
        />
      ))}
    </View>
  ),
};
