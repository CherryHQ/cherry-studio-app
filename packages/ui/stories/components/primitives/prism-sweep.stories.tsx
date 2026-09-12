import { PrismSweep } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const sizes = [16, 20, 28, 36];
const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Loading/PrismSweep',
  component: PrismSweep,
  args: {
    accessibilityLabel: 'Loading',
    active: true,
    dotClassName: 'bg-foreground',
    size: 20,
  },
  argTypes: {
    dotClassName: {
      control: 'select',
      options: ['bg-foreground', 'bg-primary', 'bg-success', 'bg-warning'],
    },
    size: { control: { min: 12, max: 64, step: 1, type: 'range' } },
  },
} satisfies Meta<typeof PrismSweep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4 p-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-4 bg-background p-4">
            <Text className="text-base font-semibold text-foreground">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <View className="flex-row items-center gap-6">
              {sizes.map((size) => (
                <PrismSweep {...args} key={size} size={size} />
              ))}
            </View>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
