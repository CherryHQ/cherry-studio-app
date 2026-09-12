import { Chip } from '@cherrystudio/ui/components';
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
  label: string;
  theme: (typeof themes)[number]['value'];
};

function ThemePreview({ label, theme }: ThemePreviewProps) {
  const [isSearchSelected, setIsSearchSelected] = useState(true);
  const [isReasoningSelected, setIsReasoningSelected] = useState(false);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-5 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Removable</Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip.Removable onRemove={fn()} removeAccessibilityLabel="Remove Web search">
              Web search
            </Chip.Removable>
            <Chip.Removable disabled onRemove={fn()} removeAccessibilityLabel="Remove Files">
              Files
            </Chip.Removable>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Selectable</Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip.Selectable onSelectedChange={setIsSearchSelected} selected={isSearchSelected}>
              Search
            </Chip.Selectable>
            <Chip.Selectable
              onSelectedChange={setIsReasoningSelected}
              selected={isReasoningSelected}
            >
              Reasoning
            </Chip.Selectable>
            <Chip.Selectable disabled onSelectedChange={fn()} selected={false}>
              Disabled
            </Chip.Selectable>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Tag</Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip.Tag>GPT-5.6</Chip.Tag>
            <Chip.Tag>128k context</Chip.Tag>
          </View>
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Chip',
  component: Chip.Tag,
  args: {
    children: 'Tag',
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
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
} satisfies Meta<typeof Chip.Tag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
