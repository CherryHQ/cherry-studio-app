import { Surface, type SurfaceProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/Surface',
  component: Surface,
  args: {
    interactive: true,
    shape: 'rounded',
    tone: 'default',
  },
  argTypes: {
    children: { control: false },
    shape: { control: 'select', options: ['circle', 'pill', 'rounded'] },
    tone: {
      control: 'select',
      options: ['default', 'sidebar-accent', 'sidebar-primary'],
    },
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
} satisfies Meta<SurfaceProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-4 bg-background p-4">
            <Text className="font-semibold text-foreground text-lg">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <View className="items-start">
              <Surface {...args}>
                <View className="h-14 min-w-36 items-center justify-center px-4">
                  <Text className="text-foreground">Configurable surface</Text>
                </View>
              </Surface>
            </View>
            <View className="flex-row items-center gap-4 bg-sidebar p-4">
              <Surface interactive shape="pill" tone="sidebar-primary">
                <View className="h-11 items-center justify-center px-4">
                  <Text className="font-medium text-sidebar-primary-foreground">New chat</Text>
                </View>
              </Surface>
              <Surface interactive shape="circle" tone="sidebar-accent">
                <View className="size-11 items-center justify-center">
                  <Text className="text-sidebar-foreground">•••</Text>
                </View>
              </Surface>
            </View>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
