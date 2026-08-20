import type { Meta, StoryObj } from '@storybook/react-native';

import { AssistantMessage } from '@/frontend/components/messages';

import { messageExamples } from './messageFixtures';
import { MessagesStoryFrame } from './MessagesStoryFrame';

const meta = {
  title: 'Messages/Playground',
  component: AssistantMessage,
  args: { message: messageExamples[2]!.message },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof AssistantMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  render: () => <MessagesStoryFrame examples={messageExamples} theme="light" />,
};

export const Dark: Story = {
  render: () => <MessagesStoryFrame examples={messageExamples} theme="dark" />,
};
