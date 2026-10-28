import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, MarkdownText, MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const onLinkPress = fn();
const onSourcePress = fn();
const onCopy = fn();

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

export const DetailSections: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <View className="gap-6">
          <MessagePart.TextSection
            title="Result"
            value="Found three matching documents. The latest revision includes the requested configuration."
          />
          <MessagePart.Section
            title="Arguments"
            action={
              <Button
                accessibilityLabel="Copy full text"
                icon={<CopyIcon />}
                onPress={onCopy}
                size="sm"
                variant="ghost"
              />
            }
          >
            <MarkdownText
              fontSizeStep={0}
              markdown={
                '```json\n{\n  "question": "Transcribe the recording",\n  "refs": ["audio-1"],\n  "includeTimestamps": false\n}\n```'
              }
              onLinkPress={onLinkPress}
            />
          </MessagePart.Section>
          <MessagePart.TextSection
            title="Error"
            tone="danger"
            value="The provider could not complete the request. Try again after the rate limit resets."
          />
          <MessagePart.ValueSection
            title="Details"
            value={{ Status: 429, Provider: 'Example provider', 'Retry after': '30 s' }}
          />
          <MessagePart.TextSection
            title="Response body"
            value={'{\n  "error": {\n    "code": "rate_limit",\n    "retryAfter": 30\n  }\n}'}
            variant="code"
          />
        </View>
      )}
    </MessagePartStoryFrame>
  ),
};
