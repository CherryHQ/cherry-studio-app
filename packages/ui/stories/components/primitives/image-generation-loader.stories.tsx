import {
  ImageGenerationLoader,
  type ImageGenerationLoaderProps,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const meta = {
  title: 'Components/Loading/ImageGenerationLoader',
  component: ImageGenerationLoader,
  args: {
    accessibilityLabel: 'Generating image',
    active: true,
    label: 'Generating image',
    resolution: '1024 \u00d7 1024',
    size: 208,
  },
  argTypes: {
    size: { control: { min: 128, max: 240, step: 8, type: 'range' } },
  },
} satisfies Meta<typeof ImageGenerationLoader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 p-4"
      showsVerticalScrollIndicator={false}
    >
      <ThemePreview args={args} label="Light" theme="light" />
      <ThemePreview args={args} label="Dark" theme="dark" />
    </ScrollView>
  ),
};

export const Static: Story = {
  args: { active: false },
  render: (args) => (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <ImageGenerationLoader {...args} />
    </View>
  ),
};

/** One masonry column of the drawings gallery, at the ratio that was requested. */
export const Tile: Story = {
  args: { height: 99, resolution: '1664 × 928', width: 177 },
  render: (args) => (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <ImageGenerationLoader {...args} />
    </View>
  ),
};

export const Portrait: Story = {
  args: { height: 224, resolution: '928 \u00d7 1664', width: 128 },
  render: (args) => (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <ImageGenerationLoader {...args} />
    </View>
  ),
};

type ThemePreviewProps = Readonly<{
  args: ImageGenerationLoaderProps;
  label: string;
  theme: 'dark' | 'light';
}>;

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  return (
    <ScopedTheme theme={theme}>
      <View className="items-center gap-4 rounded-lg bg-background p-4">
        <Text className="self-start text-sm font-semibold text-foreground">{label}</Text>
        <ImageGenerationLoader {...args} />
      </View>
    </ScopedTheme>
  );
}
