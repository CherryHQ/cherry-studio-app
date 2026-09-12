import { SelectionIndicator } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/Selection Indicator',
  component: SelectionIndicator,
  args: {
    selected: true,
    variant: 'default',
  },
  argTypes: {
    selected: { control: 'boolean' },
    variant: { control: 'select', options: ['default', 'overlay'] },
  },
  render: (args) => (
    <View className="flex-1 gap-4 bg-background p-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-3 border border-border bg-background p-4">
            <Text className="font-semibold text-foreground text-lg">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <View className="flex-row items-center gap-3">
              <SelectionIndicator {...args} />
              <Text className="text-base text-foreground">Configured state</Text>
            </View>
            <View className="flex-row items-center gap-3 rounded-lg bg-constant-black/40 p-3">
              <SelectionIndicator selected={false} variant="overlay" />
              <Text className="text-base text-constant-white">Overlay state</Text>
            </View>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
} satisfies Meta<typeof SelectionIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
