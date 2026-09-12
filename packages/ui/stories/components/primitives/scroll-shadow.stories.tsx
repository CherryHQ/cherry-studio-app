import { ScrollShadow } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/ScrollShadow',
  component: ScrollShadow,
  args: {
    children: <ScrollView />,
    size: 48,
    visibility: 'auto',
  },
  argTypes: {
    visibility: {
      control: 'select',
      options: ['auto', 'top', 'bottom', 'both', 'none'],
    },
  },
} satisfies Meta<typeof ScrollShadow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4 p-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-3 bg-background p-4">
            <Text className="text-base font-semibold text-foreground">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <ScrollShadow {...args} className="h-48">
              <ScrollView className="flex-1" contentContainerClassName="gap-3 p-3">
                {Array.from({ length: 12 }, (_, index) => (
                  <Text className="text-base text-foreground" key={index}>
                    Message {index + 1}
                  </Text>
                ))}
              </ScrollView>
            </ScrollShadow>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
