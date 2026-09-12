import { Spinner, type SpinnerColor, type SpinnerSize } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const sizes: SpinnerSize[] = ['sm', 'default', 'lg'];
const colors: SpinnerColor[] = ['default', 'success', 'warning', 'danger'];
const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Loading/Spinner',
  component: Spinner,
  args: {
    accessibilityLabel: 'Loading',
    color: 'default',
    size: 'default',
  },
  argTypes: {
    color: { control: 'select', options: colors },
    size: { control: 'select', options: sizes },
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
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-4 bg-background p-4">
            <Text className="text-base font-semibold text-foreground">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <View className="flex-row items-center gap-6">
              {sizes.map((size) => (
                <Spinner {...args} key={size} size={size} />
              ))}
            </View>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
