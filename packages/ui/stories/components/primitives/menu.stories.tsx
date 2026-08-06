import { Menu } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const onEdit = fn();
const onDelete = fn();
const themes = ['light', 'dark'] as const;

const meta = {
  title: 'Components/Primitives/Menu',
  component: Menu,
  args: {
    children: <View />,
    items: [],
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
} satisfies Meta<typeof Menu>;

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
            <Menu
              items={[
                {
                  icon: <PencilIcon className="size-5 text-foreground" />,
                  id: 'edit',
                  label: 'Edit',
                  onPress: onEdit,
                  systemImage: 'pencil',
                },
                {
                  icon: <Trash2Icon className="size-5 text-danger" />,
                  id: 'delete',
                  label: 'Delete',
                  onPress: onDelete,
                  role: 'destructive',
                  systemImage: 'trash',
                },
              ]}
            >
              <Pressable
                accessibilityLabel="More actions"
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full bg-field active:opacity-60"
              >
                <EllipsisIcon className="size-5 text-foreground" />
              </Pressable>
            </Menu>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
