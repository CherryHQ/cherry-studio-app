import {
  ActionMenu,
  ContextMenu,
  ContextMenuScrollBoundary,
  type MenuItem,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const onEdit = fn();
const onDelete = fn();
const themes = ['light', 'dark'] as const;
const menuItems = [
  { id: 'edit', label: 'Edit', onPress: onEdit },
  {
    destructive: true,
    id: 'delete',
    label: 'Delete',
    onPress: onDelete,
  },
] satisfies readonly MenuItem[];

const meta = {
  title: 'Components/Primitives/Menu',
  decorators: [
    (Story) => (
      <ContextMenuScrollBoundary>
        {(scrollHandlers) => (
          <ScrollView
            {...scrollHandlers}
            className="flex-1"
            contentContainerClassName="flex-grow gap-4 p-4"
            contentInsetAdjustmentBehavior="automatic"
          >
            <Story />
          </ScrollView>
        )}
      </ContextMenuScrollBoundary>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="items-start gap-4 bg-background p-4">
            <Text className="text-base font-semibold text-foreground">
              {theme === 'light' ? 'Light' : 'Dark'}
            </Text>
            <ActionMenu items={menuItems}>
              <Pressable
                accessibilityLabel="More actions"
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full bg-field active:opacity-60"
              >
                <Text className="text-xl text-foreground">...</Text>
              </Pressable>
            </ActionMenu>
            <ContextMenu items={menuItems}>
              <Pressable
                accessibilityLabel="Session row"
                accessibilityRole="button"
                className="w-full active:bg-field"
              >
                <Text className="px-4 py-2.5 text-base text-foreground">
                  Long press for actions
                </Text>
              </Pressable>
            </ContextMenu>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
