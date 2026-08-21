import { Input, type InputProps } from '@cherrystudio/ui/components';
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
  args: Extract<InputProps, { type?: 'text' }>;
  label: string;
  theme: 'dark' | 'light';
};

const passwordVisibilityAccessibilityLabels = {
  hide: 'Hide password',
  show: 'Show password',
} as const;

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);
  const [passwordValue, setPasswordValue] = useState('password');
  const [multilineValue, setMultilineValue] = useState(
    'Cherry Studio is a desktop client that supports multiple AI providers.\nAdd another line here.',
  );

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
              args.onChangeText?.(nextValue);
            }}
            value={value}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Disabled</Text>
          <Input {...args} disabled onChangeText={fn()} value="Disabled value" />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Password</Text>
          <Input
            accessibilityLabel="Password"
            onChangeText={setPasswordValue}
            placeholder="Password"
            type="password"
            value={passwordValue}
            visibilityAccessibilityLabels={passwordVisibilityAccessibilityLabels}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Empty password</Text>
          <Input
            accessibilityLabel="Empty password"
            onChangeText={fn()}
            placeholder="Password"
            type="password"
            value=""
            visibilityAccessibilityLabels={passwordVisibilityAccessibilityLabels}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Blur on toggle</Text>
          <Input
            accessibilityLabel="Blur-on-toggle password"
            blurOnVisibilityToggle
            onChangeText={fn()}
            type="password"
            value="blur-secret"
            visibilityAccessibilityLabels={passwordVisibilityAccessibilityLabels}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Disabled password</Text>
          <Input
            accessibilityLabel="Disabled password"
            disabled
            onChangeText={fn()}
            type="password"
            value="disabled-secret"
            visibilityAccessibilityLabels={passwordVisibilityAccessibilityLabels}
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
            textAlignVertical="top"
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
} satisfies Meta<Extract<InputProps, { type?: 'text' }>>;

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
