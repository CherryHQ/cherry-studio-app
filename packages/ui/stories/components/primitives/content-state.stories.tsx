import BotIcon from '@cherrystudio/app-icons/icons/bot';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/Content State',
  component: ContentState.Empty,
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
} satisfies Meta<typeof ContentState.Empty>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="gap-8 bg-background p-6">
            <Text className="font-semibold text-foreground text-lg">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <ContentState.Loading title="Loading assistants" />
            <View className="rounded-2xl bg-card p-4">
              <ContentState.Loading layout="row" title="Loading tools" />
            </View>
            <ContentState.Empty
              description="Create an assistant to get started."
              primaryAction={{ children: 'Create assistant', onPress: fn() }}
              secondaryAction={{ children: 'Import', onPress: fn() }}
              title="No assistants"
            />
            <View className="px-8 py-16">
              <ContentState.Empty
                description="Create an assistant to get started."
                icon={
                  <ContentState.Icon>
                    <BotIcon className="size-7 text-foreground" />
                  </ContentState.Icon>
                }
                primaryAction={{ children: 'Create assistant', onPress: fn() }}
                prominence="prominent"
                title="No assistants"
              />
            </View>
            <View className="rounded-2xl bg-card p-4">
              <ContentState.Error
                description="The server did not respond."
                layout="leading"
                primaryAction={{
                  children: 'Try again',
                  icon: <RefreshCwIcon />,
                  onPress: fn(),
                }}
                title="Could not load content"
              />
            </View>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
