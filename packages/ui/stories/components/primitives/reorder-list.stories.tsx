import { ReorderList, type ReorderListProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { fn } from 'storybook/test';

type Item = { id: string; name: string; description: string };

const items: Item[] = [
  { id: 'work', name: 'Work', description: '•••• 1234' },
  { id: 'personal', name: 'Personal', description: '•••• 5678' },
  { id: 'backup', name: 'Backup with a longer label that can wrap', description: '•••• 9012' },
];

function ReorderPreview(args: ReorderListProps<Item>) {
  const [orderedItems, setOrderedItems] = useState(args.items);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="py-4">
      <ReorderList
        {...args}
        items={orderedItems}
        onReorder={(next) => {
          setOrderedItems(next);
          args.onReorder(next);
        }}
      />
    </ScrollView>
  );
}

const meta: Meta<ReorderListProps<Item>> = {
  title: 'Components/Primitives/Reorder List',
  component: ReorderList,
  args: {
    renderItemDescription: (item) => item.description,
    getItemKey: (item) => item.id,
    getItemLabel: (item) => item.name,
    items,
    labels: {
      moveDown: (item) => `Move ${item.name} down`,
      moveUp: (item) => `Move ${item.name} up`,
    },
    onReorder: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <ReorderPreview {...args} /> };
