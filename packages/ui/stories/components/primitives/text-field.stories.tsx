import { Description, FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

const noop = () => undefined;

function ThemePreview({ label, theme }: { label: string; theme: 'dark' | 'light' }) {
  const [multilineValue, setMultilineValue] = useState(
    'Cherry Studio supports multiple AI providers.\nAdd configuration notes here.',
  );
  const [value, setValue] = useState('Cherry Studio');

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-5 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>

        <TextField>
          <Label>Name</Label>
          <Input accessibilityLabel="Name" onChangeText={setValue} value={value} />
        </TextField>

        <TextField isRequired>
          <Label>Email</Label>
          <Input
            accessibilityLabel="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={noop}
            value="hello@cherry.ai"
          />
          <Description>Used for account notifications.</Description>
        </TextField>

        <TextField isInvalid>
          <Label>API Key</Label>
          <Input accessibilityLabel="API Key" onChangeText={noop} value="" />
          <FieldError>API Key is required.</FieldError>
        </TextField>

        <TextField isDisabled>
          <Label>Organization</Label>
          <Input accessibilityLabel="Organization" onChangeText={noop} value="Cherry AI" />
        </TextField>

        <TextField>
          <Label>Notes</Label>
          <Input
            accessibilityLabel="Notes"
            multiline
            onChangeText={setMultilineValue}
            textAlignVertical="top"
            value={multilineValue}
          />
          <Description>Four visible lines with overflow scrolling.</Description>
        </TextField>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/TextField',
  component: TextField,
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
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
