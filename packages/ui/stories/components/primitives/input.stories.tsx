import { Input, type InputProps } from '@cherrystudio/ui/components';
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
  args: InputProps;
  label: string;
  theme: 'dark' | 'light';
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);
  const [multilineValue, setMultilineValue] = useState(
    'Cherry Studio is a desktop client that supports multiple AI providers.\nAdd another line here.',
  );

  useEffect(() => setValue(args.value), [args.value]);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Default</Text>
          <Input
            {...args}
            disabled={false}
            onChangeText={(nextValue) => {
              setValue(nextValue);
              args.onChangeText(nextValue);
            }}
            value={value}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Disabled</Text>
          <Input {...args} disabled onChangeText={fn()} value="Disabled value" />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Secure</Text>
          <Input
            {...args}
            accessibilityLabel="Password"
            onChangeText={fn()}
            placeholder="Password"
            secureTextEntry
            value="password"
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Multiline</Text>
          <Input
            {...args}
            accessibilityLabel="Description"
            multiline
            onChangeText={setMultilineValue}
            placeholder="Enter a description"
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            value={multilineValue}
          />
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Input',
  component: Input,
  args: {
    accessibilityLabel: 'Name',
    autoCapitalize: 'sentences',
    autoCorrect: true,
    autoFocus: false,
    disabled: false,
    onChangeText: fn(),
    placeholder: 'Enter a value',
    secureTextEntry: false,
    value: '',
  },
  argTypes: {
    autoCapitalize: {
      control: 'select',
      options: ['none', 'sentences', 'words', 'characters'],
    },
    autoCorrect: { control: 'boolean' },
    autoFocus: { control: 'boolean' },
    disabled: { control: 'boolean' },
    multiline: { control: 'boolean' },
    secureTextEntry: { control: 'boolean' },
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
} satisfies Meta<typeof Input>;

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
