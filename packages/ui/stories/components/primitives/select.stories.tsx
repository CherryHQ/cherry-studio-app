import { Select } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

const options = [
  { label: 'Not set', value: 'not-set' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
] as const;

type SelectOption = (typeof options)[number];

function SelectExample({
  disabled = false,
  label,
  initialValue,
}: {
  disabled?: boolean;
  initialValue: SelectOption;
  label: string;
}) {
  const [value, setValue] = useState<SelectOption>(initialValue);

  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-base text-foreground">{label}</Text>
      <Select
        isDisabled={disabled}
        onValueChange={(nextValue) => {
          const option = options.find((item) => item.value === nextValue?.value);
          if (option) setValue(option);
        }}
        value={value}
      >
        <Select.Trigger accessibilityLabel="Provider">
          <Select.Value placeholder="Select a provider" />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal>
          <Select.Overlay />
          <Select.Content presentation="popover" width="trigger">
            {options.map((option) => (
              <Select.Item key={option.value} label={option.label} value={option.value}>
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Portal>
      </Select>
    </View>
  );
}

function ThemePreview({ label, theme }: { label: string; theme: 'dark' | 'light' }) {
  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <SelectExample initialValue={options[1]} label="Default" />
        <SelectExample initialValue={options[0]} label="Not set" />
        <SelectExample disabled initialValue={options[1]} label="Disabled" />
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Select',
  component: Select,
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
} satisfies Meta<typeof Select>;

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
