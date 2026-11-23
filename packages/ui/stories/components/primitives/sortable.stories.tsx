import { ScrollInteractionBoundary, Section, Sortable, Switch } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { fn } from 'storybook/test';

type StoryItem = {
  description: string;
  enabled: boolean;
  id: string;
  name: string;
};

const initialItems: StoryItem[] = [
  { description: '•••• 1234', enabled: true, id: 'work', name: 'Work' },
  { description: '•••• 5678', enabled: true, id: 'personal', name: 'Personal' },
  { description: '•••• 9012', enabled: false, id: 'backup', name: 'Backup' },
];

function SortablePreview({ onReorder }: { onReorder: (items: StoryItem[]) => void }) {
  const [items, setItems] = useState(initialItems);

  const commitOrder = (fromIndex: number, toIndex: number) => {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    onReorder(next);
  };

  return (
    <Sortable.Root>
      {({ isDragging }) => (
        <ScrollInteractionBoundary>
          {(scrollHandlers) => (
            <ScrollView
              {...scrollHandlers}
              className="flex-1 bg-background"
              contentContainerClassName="px-4 py-4"
              scrollEnabled={!isDragging}
            >
              <Sortable.Group
                estimatedItemHeight={64}
                groupId="keys"
                itemIds={items.map((item) => item.id)}
                onReorder={({ fromIndex, toIndex }) => commitOrder(fromIndex, toIndex)}
              >
                <Section>
                  {items.map((item, index) => (
                    <Sortable.Item
                      accessibilityLabels={{
                        moveDown: `Move ${item.name} down`,
                        moveToTop: 'Move to top',
                        moveUp: `Move ${item.name} up`,
                      }}
                      estimatedHeight={64}
                      groupId="keys"
                      id={item.id}
                      index={index}
                      key={item.id}
                      menuItems={[
                        ...(index > 0
                          ? [
                              {
                                id: 'move-to-top',
                                label: 'Move to top',
                                onPress: () => commitOrder(index, 0),
                              },
                            ]
                          : []),
                      ]}
                    >
                      <Section.Item
                        description={item.description}
                        label={item.name}
                        onPress={() => undefined}
                        trailing={
                          <Sortable.Exclusion>
                            <Switch
                              accessibilityLabel={`Enable ${item.name}`}
                              onValueChange={(enabled) =>
                                setItems((current) =>
                                  current.map((entry) =>
                                    entry.id === item.id ? { ...entry, enabled } : entry,
                                  ),
                                )
                              }
                              value={item.enabled}
                            />
                          </Sortable.Exclusion>
                        }
                      />
                    </Sortable.Item>
                  ))}
                </Section>
              </Sortable.Group>
            </ScrollView>
          )}
        </ScrollInteractionBoundary>
      )}
    </Sortable.Root>
  );
}

const meta: Meta<typeof SortablePreview> = {
  args: { onReorder: fn() },
  component: SortablePreview,
  title: 'Components/Primitives/Sortable',
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <SortablePreview {...args} />,
};
