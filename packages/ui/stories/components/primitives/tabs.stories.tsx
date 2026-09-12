import MessageCircleIcon from '@cherrystudio/app-icons/icons/message-circle';
import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { Tabs, type TabsItemState, type TabsProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const items = [
  { label: 'Messages', value: 'messages' },
  { label: 'Assistants', value: 'assistants' },
  { label: 'Settings', value: 'settings' },
] as const;

const customItems = [
  {
    children: ({ isSelected }: TabsItemState) => (
      <View className="flex-row items-center gap-1.5">
        <MessageCircleIcon
          className={isSelected ? 'size-4 text-foreground' : 'size-4 text-muted-foreground'}
        />
        <Text className={isSelected ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          Messages
        </Text>
        <Text className="text-foreground-tertiary">12</Text>
      </View>
    ),
    label: 'Messages',
    value: 'messages',
  },
  {
    children: ({ isSelected }: TabsItemState) => (
      <View className="flex-row items-center gap-1.5">
        <SettingsIcon
          className={isSelected ? 'size-4 text-foreground' : 'size-4 text-muted-foreground'}
        />
        <Text className={isSelected ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          Settings
        </Text>
      </View>
    ),
    label: 'Settings',
    value: 'settings',
  },
] as const;

type TabValue = (typeof items)[number]['value'];
type TabsStoryArgs = TabsProps<TabValue>;

const themes = ['light', 'dark'] as const;
function TabsPreview({ args }: { args: TabsStoryArgs }) {
  const [value, setValue] = useState(args.value);

  useEffect(() => setValue(args.value), [args.value]);

  return (
    <View>
      <Tabs
        {...args}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          args.onValueChange(nextValue);
        }}
        value={value}
      />
    </View>
  );
}

function CustomTabsPreview() {
  const [value, setValue] = useState<(typeof customItems)[number]['value']>('messages');

  return <Tabs items={customItems} onValueChange={setValue} value={value} />;
}

const meta = {
  title: 'Components/Primitives/Tabs',
  component: Tabs,
  args: {
    items,
    onValueChange: fn(),
    value: 'messages',
  },
  argTypes: {
    items: { control: false },
    value: { control: 'select', options: items.map((item) => item.value) },
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
} satisfies Meta<TabsStoryArgs>;

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
            <TabsPreview args={args} />
            <CustomTabsPreview />
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
