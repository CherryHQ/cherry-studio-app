import BotIcon from '@cherrystudio/app-icons/icons/bot';
import { SelectField } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = ['light', 'dark'] as const;

function ThemePreview({ theme }: { theme: (typeof themes)[number] }) {
  const [model, setModel] = useState('Claude Sonnet 4.5');

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="font-semibold text-foreground text-lg">
          {theme === 'light' ? 'Light' : 'Dark'}
        </Text>
        <SelectField
          accessibilityLabel="Select model"
          onPress={() =>
            setModel((current) =>
              current === 'Claude Sonnet 4.5' ? 'GPT-5.6' : 'Claude Sonnet 4.5',
            )
          }
        >
          <SelectField.Label>Model</SelectField.Label>
          <SelectField.Value>
            <BotIcon className="size-5 text-foreground" />
            <SelectField.ValueText>{model}</SelectField.ValueText>
          </SelectField.Value>
        </SelectField>
        <SelectField accessibilityLabel="Unavailable model" disabled onPress={fn()}>
          <SelectField.Label>Model</SelectField.Label>
          <SelectField.Value>
            <SelectField.ValueText>Unavailable</SelectField.ValueText>
          </SelectField.Value>
        </SelectField>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Select Field',
  component: SelectField,
  args: {
    accessibilityLabel: 'Select value',
    children: null,
    onPress: fn(),
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
} satisfies Meta<typeof SelectField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview key={theme} theme={theme} />
      ))}
    </View>
  ),
};
