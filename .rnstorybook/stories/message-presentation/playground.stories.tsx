import type { Meta, StoryObj } from '@storybook/react-native';

import { AssistantMessage } from '@/frontend/components/messagePresentation';

import { messagePresentationExamples } from './messagePresentationFixtures';
import { MessagePresentationStoryFrame } from './MessagePresentationStoryFrame';

const meta = {
  title: 'Message Presentation/Playground',
  component: AssistantMessage,
  args: { message: messagePresentationExamples[2]!.message },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof AssistantMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  render: () => (
    <MessagePresentationStoryFrame examples={messagePresentationExamples} theme="light" />
  ),
};

export const Dark: Story = {
  render: () => (
    <MessagePresentationStoryFrame examples={messagePresentationExamples} theme="dark" />
  ),
};
