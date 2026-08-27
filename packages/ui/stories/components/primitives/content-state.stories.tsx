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
            <ContentState.Empty
              description="Create an assistant to get started."
              primaryAction={{ children: 'Create assistant', onPress: fn() }}
              secondaryAction={{ children: 'Import', onPress: fn() }}
              title="No assistants"
            />
            <ContentState.Empty
              description="Create an assistant to get started."
              icon={
                <ContentState.Icon>
                  <BotIcon className="size-7 text-foreground" />
                </ContentState.Icon>
              }
              layout="page"
              primaryAction={{ children: 'Create assistant', onPress: fn() }}
              title="No assistants"
            />
            <ContentState.Error
              description="The server did not respond."
              primaryAction={{
                children: 'Try again',
                icon: <RefreshCwIcon />,
                onPress: fn(),
              }}
              title="Could not load content"
            />
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
