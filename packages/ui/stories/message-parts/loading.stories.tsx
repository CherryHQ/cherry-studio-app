import { MarkdownText, MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const meta = {
  title: 'Message Parts/Loading',
  component: MessagePart.Pending,
  args: {
    accessibilityLabel: 'Waiting for response',
  },
} satisfies Meta<typeof MessagePart.Pending>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WaitingForResponse: Story = {
  render: (args) => (
    <MessagePartStoryFrame>
      {() => (
        <MessagePart>
          <MessagePart.Pending {...args} />
        </MessagePart>
      )}
    </MessagePartStoryFrame>
  ),
};

export const Thinking: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <MessagePart>
          <MessagePart.Reasoning
            detailTitle="Deep thinking"
            state="running"
            statusText="Thinking 1.2s"
          >
            <MarkdownText
              fontSizeStep={0}
              isStreaming
              markdown="I am comparing the available context and checking the constraints."
              onLinkPress={fn()}
            />
          </MessagePart.Reasoning>
        </MessagePart>
      )}
    </MessagePartStoryFrame>
  ),
};
