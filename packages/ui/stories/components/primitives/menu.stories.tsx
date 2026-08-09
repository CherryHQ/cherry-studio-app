import { DropdownMenu } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const onEdit = fn();
const onDelete = fn();
const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/Menu',
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
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Pressable
                  accessibilityLabel="More actions"
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full bg-field active:opacity-60"
                >
                  <Text className="text-xl text-foreground">...</Text>
                </Pressable>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item key="edit" onSelect={onEdit}>
                  <DropdownMenu.ItemIcon ios={{ name: 'pencil' }} />
                  <DropdownMenu.ItemTitle>Edit</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
                <DropdownMenu.Item key="delete" destructive onSelect={onDelete}>
                  <DropdownMenu.ItemIcon ios={{ name: 'trash' }} />
                  <DropdownMenu.ItemTitle>Delete</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
