import {
  DotMatrixSquare2,
  DotMatrixSquare6,
  DotMatrixSquare19,
  DotMatrixSquare20,
  PrismSweep,
  type DotMatrixSquare2Props,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { ComponentType } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

type LoaderDefinition = Readonly<{
  Component: ComponentType<DotMatrixSquare2Props>;
  label: string;
}>;

const loaders: readonly LoaderDefinition[] = [
  { Component: DotMatrixSquare2, label: 'Square 2' },
  { Component: DotMatrixSquare6, label: 'Square 6' },
  { Component: DotMatrixSquare19, label: 'Square 19' },
  { Component: DotMatrixSquare20, label: 'Square 20' },
  { Component: PrismSweep, label: 'PrismSweep' },
];

const meta = {
  title: 'Components/Loading/DotMatrix',
  component: DotMatrixSquare2,
  args: {
    accessibilityLabel: 'Loading',
    active: true,
    dotClassName: 'bg-foreground',
    size: 36,
  },
  argTypes: {
    dotClassName: {
      control: 'select',
      options: ['bg-foreground', 'bg-primary', 'bg-success', 'bg-warning'],
    },
    size: { control: { min: 12, max: 64, step: 1, type: 'range' } },
  },
} satisfies Meta<typeof DotMatrixSquare2>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 p-4"
      showsVerticalScrollIndicator={false}
    >
      <ThemeGallery args={args} label="Light" theme="light" />
      <ThemeGallery args={args} label="Dark" theme="dark" />
    </ScrollView>
  ),
};

type ThemeGalleryProps = Readonly<{
  args: DotMatrixSquare2Props;
  label: string;
  theme: 'dark' | 'light';
}>;

function ThemeGallery({ args, label, theme }: ThemeGalleryProps) {
  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 rounded-lg bg-background p-4">
        <Text className="text-base font-semibold text-foreground">{label}</Text>
        <View className="flex-row flex-wrap">
          {loaders.map(({ Component, label: loaderLabel }) => (
            <View className="w-1/2 items-center gap-2 py-4" key={loaderLabel}>
              <View className="size-16 items-center justify-center">
                <Component {...args} />
              </View>
              <Text className="text-sm text-muted-foreground">{loaderLabel}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScopedTheme>
  );
}
