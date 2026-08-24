import { MarkdownText, MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const meta = {
  title: 'Message Parts/Reasoning',
  component: MessagePart.Reasoning,
  args: {
    children: null,
    detailTitle: 'Reasoning',
    state: 'complete',
    statusText: 'Thought for 4.8s',
  },
  argTypes: {
    state: { control: 'radio', options: ['running', 'complete'] },
    statusText: { control: 'text' },
  },
} satisfies Meta<typeof MessagePart.Reasoning>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <MessagePartStoryFrame>
      {() => (
        <MessagePart.Reasoning {...args}>
          <MarkdownText
            fontSizeStep={0}
            isStreaming={args.state === 'running'}
            markdown={
              'I compared the available context, checked the constraints, and selected the smallest implementation that preserves the existing behavior.'
            }
            onLinkPress={fn()}
          />
        </MessagePart.Reasoning>
      )}
    </MessagePartStoryFrame>
  ),
};
