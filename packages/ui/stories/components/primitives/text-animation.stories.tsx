import { TextAnimation } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const phrases = ['focused', 'fluid', 'yours'];

const meta = {
  title: 'Components/Primitives/Text Animation',
  component: TextAnimation.Rotating,
  args: {
    delay: 0,
    duration: 2200,
    enabled: true,
    text: phrases,
  },
  argTypes: {
    delay: { control: { min: 0, step: 100, type: 'number' } },
    duration: { control: { min: 400, step: 100, type: 'number' } },
    enabled: { control: 'boolean' },
    text: { control: false },
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
} satisfies Meta<typeof TextAnimation.Rotating>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Rotating: Story = {
  render: (args) => (
    <View className="gap-4">
      {(['light', 'dark'] as const).map((theme) => (
        <ScopedTheme key={theme} theme={theme}>
          <View className="bg-background p-5">
            <TextAnimation duration={args.duration} delay={args.delay} enabled={args.enabled}>
              <Text className="text-xl font-semibold text-foreground">Cherry Studio is </Text>
              <TextAnimation.Rotating
                text={args.text}
                textClassName="text-xl font-semibold text-primary"
              />
            </TextAnimation>
          </View>
        </ScopedTheme>
      ))}
    </View>
  ),
};
