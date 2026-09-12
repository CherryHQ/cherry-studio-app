import { MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Text } from 'react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const meta = {
  title: 'Message Parts/Tools',
  component: MessagePart.Tool,
  args: {
    children: null,
    state: 'complete',
    title: 'Calculator',
  },
} satisfies Meta<typeof MessagePart.Tool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <MessagePart>
          <MessagePart.Tool
            state="running"
            statusText="Searching"
            testID="story-search-running"
            title="Search web"
          >
            <Text className="text-foreground text-base">Waiting for results...</Text>
          </MessagePart.Tool>
          <MessagePart.Tool
            state="complete"
            statusText="3 results"
            testID="story-search-complete"
            title="Search web"
          >
            <MessagePart.Source
              label="Cherry Studio"
              onPress={fn()}
              url="https://cherry-ai.com"
              variant="list-item"
            />
            <MessagePart.Source
              label="Documentation"
              onPress={fn()}
              url="https://docs.cherry-ai.com"
              variant="list-item"
            />
          </MessagePart.Tool>
          <MessagePart.Tool
            state="running"
            statusText="Running"
            testID="story-tool-running"
            title="Calculator"
          >
            <MessagePart.ValueSection title="Arguments" value={{ expression: '21 * 2' }} />
          </MessagePart.Tool>
          <MessagePart.Tool
            state="complete"
            statusText="Completed"
            testID="story-tool-complete"
            title="Calculator"
          >
            <MessagePart.TextSection title="Output" value="42" />
            <MessagePart.ValueSection title="Arguments" value={{ expression: '21 * 2' }} />
          </MessagePart.Tool>
          <MessagePart.Tool
            state="complete"
            statusText="Call failed"
            statusTone="danger"
            testID="story-tool-error"
            title="Terminal"
          >
            <MessagePart.TextSection tone="danger" title="Error" value="The command timed out." />
          </MessagePart.Tool>
        </MessagePart>
      )}
    </MessagePartStoryFrame>
  ),
};
