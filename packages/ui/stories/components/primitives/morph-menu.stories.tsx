import { MorphMenu, type MorphMenuProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { CameraIcon, FileIcon, ImagesIcon } from 'lucide-uniwind/png';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

const entries = [
  { Icon: CameraIcon, label: 'Camera' },
  { Icon: ImagesIcon, label: 'Photos' },
  { Icon: FileIcon, label: 'File' },
];

type ThemePreviewProps = {
  args: MorphMenuProps;
  label: string;
  theme: 'dark' | 'light';
};

/**
 * The menu opens over whatever sits next to it, so the preview gives it a
 * neighbour to overlap and room above to grow into.
 */
function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [choice, setChoice] = useState<string | null>(null);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <Text className="text-sm text-muted-foreground">{choice ?? 'Nothing chosen yet'}</Text>

        <View className="h-52 justify-end">
          <View className="flex-row items-end gap-2">
            <MorphMenu {...args}>
              {entries.map(({ Icon, label: entry }) => (
                <MorphMenu.Item
                  icon={<Icon className="size-5 text-foreground" strokeWidth={2} />}
                  key={entry}
                  label={entry}
                  onPress={() => setChoice(entry)}
                />
              ))}
            </MorphMenu>

            <View className="h-11 flex-1 justify-center rounded-3xl bg-field px-4">
              <Text className="text-base text-muted-foreground">A neighbour to overlap</Text>
            </View>
          </View>
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/MorphMenu',
  component: MorphMenu,
  args: {
    accessibilityLabel: 'Add attachment',
    children: null,
    onOpenChange: fn(),
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    width: { control: { max: 320, min: 140, step: 10, type: 'range' } },
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
} satisfies Meta<typeof MorphMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};

export const Wide: Story = {
  args: { width: 260 },
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
