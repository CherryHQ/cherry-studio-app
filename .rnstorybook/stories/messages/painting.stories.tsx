import type { Meta, StoryObj } from '@storybook/react-native';

import { PaintingAssistantMessage } from '@/frontend/features/paintings/components/PaintingAssistantMessage';

import { paintingExamples, PaintingStoryFrame } from './PaintingStoryFrame';

const meta = {
  title: 'Messages/Painting',
  component: PaintingAssistantMessage,
  args: {
    aspectRatio: 1,
    error: null,
    interruption: null,
    outputs: [],
    resolution: '1024 × 1024',
    status: 'idle',
  },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof PaintingAssistantMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  render: () => <PaintingStoryFrame examples={paintingExamples} theme="light" />,
};

export const Dark: Story = {
  render: () => <PaintingStoryFrame examples={paintingExamples} theme="dark" />,
};

export const Generating: Story = {
  render: () => <PaintingStoryFrame examples={[paintingExamples[1]!]} theme="light" />,
};

export const SingleResult: Story = {
  render: () => <PaintingStoryFrame examples={[paintingExamples[2]!]} theme="light" />,
};

export const MultipleResults: Story = {
  render: () => <PaintingStoryFrame examples={[paintingExamples[3]!]} theme="light" />,
};

export const Failed: Story = {
  render: () => <PaintingStoryFrame examples={[paintingExamples[4]!]} theme="light" />,
};

export const Interrupted: Story = {
  render: () => <PaintingStoryFrame examples={[paintingExamples[5]!]} theme="light" />,
};
