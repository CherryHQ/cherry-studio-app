import { MarkdownText, MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const onLinkPress = fn();
const onSourcePress = fn();

const meta = {
  title: 'Message Parts/Content',
  component: MessagePart,
  args: { children: null },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof MessagePart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <MessagePart>
          <MarkdownText
            fontSizeStep={0}
            isStreaming={false}
            markdown={
              '## Text\n\nMarkdown with **emphasis**, `code`, and [a link](https://cherry-ai.com).'
            }
            onLinkPress={onLinkPress}
          />
          <MessagePart.Translation>
            <MarkdownText
              fontSizeStep={0}
              isStreaming={false}
              markdown="Translated response with the same message typography."
              onLinkPress={onLinkPress}
            />
          </MessagePart.Translation>
          <MessagePart.Error
            message="The provider returned an invalid response."
            title="Request failed"
          />
          <MessagePart.Source
            label="Cherry Studio documentation"
            onPress={onSourcePress}
            url="https://docs.cherry-ai.com/getting-started"
          />
        </MessagePart>
      )}
    </MessagePartStoryFrame>
  ),
};
