import { SecureInput, type SecureInputProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

type ThemePreviewProps = {
  args: SecureInputProps;
  label: string;
  theme: (typeof themes)[number]['value'];
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Default</Text>
          <SecureInput
            {...args}
            disabled={false}
            onChangeText={(nextValue) => {
              setValue(nextValue);
              args.onChangeText?.(nextValue);
            }}
            value={value}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Empty</Text>
          <SecureInput {...args} disabled={false} onChangeText={fn()} value="" />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Blur on toggle</Text>
          <SecureInput
            {...args}
            blurOnVisibilityToggle
            disabled={false}
            onChangeText={fn()}
            value="blur-secret"
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Disabled</Text>
          <SecureInput {...args} disabled onChangeText={fn()} value="disabled-secret" />
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/SecureInput',
  component: SecureInput,
  args: {
    accessibilityLabel: 'API key',
    blurOnVisibilityToggle: false,
    disabled: false,
    onChangeText: fn(),
    placeholder: 'Enter API key',
    value: 'sk-example-secret',
    visibilityAccessibilityLabels: {
      hide: 'Hide API key',
      show: 'Show API key',
    },
  },
  argTypes: {
    blurOnVisibilityToggle: { control: 'boolean' },
    disabled: { control: 'boolean' },
    value: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4 p-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof SecureInput>;

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
