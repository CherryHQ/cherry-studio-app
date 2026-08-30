import SearchIcon from '@cherrystudio/app-icons/icons/search';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { FilePreview, MarkdownText, MessagePart } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from './story-frame';

const onLinkPress = fn();
const onSourcePress = fn();
const onFileError = fn();

const fileLabels = {
  openWith: 'Open with',
  unavailable: 'Attachment unavailable',
};

const imageFile = {
  displayName: 'cherry-studio.png',
  extensionLabel: 'PNG',
  id: 'playground-image',
  kind: 'image' as const,
  revision: 1,
  uri: 'https://placehold.co/224x224/png?text=Cherry',
};

const documentFile = {
  displayName: 'project-brief.pdf',
  extensionLabel: 'PDF',
  id: 'playground-document',
  // No plugin claims `pdf`, so this renders through the platform fallback.
  kind: 'pdf' as const,
  revision: 1,
  uri: 'file:///storybook/project-brief.pdf',
};

const meta = {
  title: 'Message Parts/Playground',
  component: MessagePart,
  args: { children: null },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof MessagePart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <View className="gap-6">
          <StoryGroup title="Loading">
            <MessagePart>
              <MessagePart.Pending accessibilityLabel="Waiting for response" />
            </MessagePart>
          </StoryGroup>

          <StoryGroup title="Content">
            <MessagePart>
              <StoryExample title="Text">
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming={false}
                  markdown={
                    '### Assistant response\n\nMarkdown with **emphasis**, `inline code`, and [a link](https://cherry-ai.com).\n\n| State | Result |\n| --- | --- |\n| Static | Ready |\n\n$E = mc^2$'
                  }
                  onLinkPress={onLinkPress}
                />
              </StoryExample>
              <StoryExample title="Streaming text">
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming
                  markdown="This response is still arriving with **streaming markdown**..."
                  onLinkPress={onLinkPress}
                />
              </StoryExample>
              <StoryExample title="Code data">
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming={false}
                  markdown={'```ts\nconst answer = 42;\n```'}
                  onLinkPress={onLinkPress}
                />
              </StoryExample>
              <StoryExample title="Block math">
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming={false}
                  markdown={'$$\n\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$'}
                  onLinkPress={onLinkPress}
                />
              </StoryExample>
              <StoryExample title="Compacted context">
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming={false}
                  markdown="**Conversation compacted:** Earlier messages were summarized to preserve the context window."
                  onLinkPress={onLinkPress}
                />
              </StoryExample>
              <StoryExample title="Translation">
                <MessagePart.Translation>
                  <MarkdownText
                    fontSizeStep={0}
                    isStreaming={false}
                    markdown="Translated response with the same message typography."
                    onLinkPress={onLinkPress}
                  />
                </MessagePart.Translation>
              </StoryExample>
            </MessagePart>
          </StoryGroup>

          <StoryGroup title="Reasoning">
            <MessagePart>
              <MessagePart.Reasoning
                detailTitle="Deep thinking"
                state="running"
                statusText="Thinking 1.2s"
                testID="playground-reasoning-running"
              >
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming
                  markdown="I am comparing the available context and checking the constraints."
                  onLinkPress={onLinkPress}
                />
              </MessagePart.Reasoning>
              <MessagePart.Reasoning
                detailTitle="Deep thinking"
                state="complete"
                statusText="Thought for 4.8s"
                testID="playground-reasoning-complete"
              >
                <MarkdownText
                  fontSizeStep={0}
                  isStreaming={false}
                  markdown="I compared the context and selected the smallest compatible change."
                  onLinkPress={onLinkPress}
                />
              </MessagePart.Reasoning>
            </MessagePart>
          </StoryGroup>

          <StoryGroup title="Attachments">
            <View className="flex-row flex-wrap gap-2">
              <StoryExample title="Image">
                <FilePreview
                  file={imageFile}
                  labels={fileLabels}
                  onError={onFileError}
                  size={104}
                />
              </StoryExample>
              <StoryExample title="Document">
                <FilePreview
                  file={documentFile}
                  labels={fileLabels}
                  onError={onFileError}
                  size={104}
                />
              </StoryExample>
              <StoryExample title="Unavailable">
                <FilePreview labels={fileLabels} size={104} />
              </StoryExample>
            </View>
          </StoryGroup>

          <StoryGroup title="Tools">
            <MessagePart>
              <MessagePart.Tool
                icon={SearchIcon}
                state="running"
                statusText="Searching"
                testID="playground-search-running"
                title="Cherry Studio"
              >
                <Text className="text-foreground text-base">Waiting for results...</Text>
              </MessagePart.Tool>
              <MessagePart.Tool
                icon={SearchIcon}
                state="complete"
                statusText="3 results"
                testID="playground-search-complete"
                title="Cherry Studio"
              >
                <MessagePart.Source
                  label="Cherry Studio"
                  onPress={onSourcePress}
                  url="https://cherry-ai.com"
                  variant="list-item"
                />
                <MessagePart.Source
                  label="Documentation"
                  onPress={onSourcePress}
                  url="https://docs.cherry-ai.com"
                  variant="list-item"
                />
              </MessagePart.Tool>
              <MessagePart.Tool
                icon={WrenchIcon}
                state="running"
                statusText="Running"
                testID="playground-tool-running"
                title="Calculator"
              >
                <MessagePart.ValueSection title="Arguments" value={{ expression: '21 * 2' }} />
              </MessagePart.Tool>
              <MessagePart.Tool
                icon={WrenchIcon}
                state="complete"
                statusText="Completed"
                testID="playground-tool-complete"
                title="Calculator"
              >
                <MessagePart.TextSection title="Output" value="42" />
                <MessagePart.ValueSection title="Arguments" value={{ expression: '21 * 2' }} />
              </MessagePart.Tool>
              <MessagePart.Tool
                state="complete"
                statusText="Completed"
                testID="playground-mcp-tool"
                title="Filesystem: read_file"
              >
                <MessagePart.TextSection
                  title="Response"
                  value="# Project Plan\n\n- Define scope\n- Review sources"
                />
                <MessagePart.ValueSection
                  title="Arguments"
                  value={{ path: '/Documents/project-plan.md' }}
                />
              </MessagePart.Tool>
              <MessagePart.Tool
                state="complete"
                statusText="2 tools"
                testID="playground-meta-tool"
                title="Search tools"
              >
                <MessagePart.ValueSection
                  title="Arguments"
                  value={{ namespace: 'browser', query: 'open url' }}
                />
                <MessagePart.TextSection
                  title="Results"
                  value={'browser.open_url\nbrowser.screenshot'}
                />
              </MessagePart.Tool>
              <MessagePart.Tool
                state="complete"
                statusText="Run denied"
                statusTone="warning"
                testID="playground-tool-warning"
                title="Terminal"
              >
                <Text className="text-foreground text-base">The action was not approved.</Text>
              </MessagePart.Tool>
              <MessagePart.Tool
                state="complete"
                statusText="Call failed"
                statusTone="danger"
                testID="playground-tool-error"
                title="Terminal"
              >
                <MessagePart.TextSection
                  tone="danger"
                  title="Error"
                  value="The command timed out."
                />
              </MessagePart.Tool>
            </MessagePart>
          </StoryGroup>

          <StoryGroup title="Feedback and sources">
            <MessagePart>
              <StoryExample title="Error">
                <MessagePart.Error
                  message="The provider returned an invalid response."
                  title="Request failed"
                />
              </StoryExample>
              <StoryExample title="Source URL">
                <MessagePart.Source
                  label="Cherry Studio documentation"
                  onPress={onSourcePress}
                  url="https://docs.cherry-ai.com/getting-started"
                />
              </StoryExample>
              <StoryExample title="Unknown part fallback">
                <MessagePart.Unknown label="Unknown Part" />
              </StoryExample>
            </MessagePart>
          </StoryGroup>
        </View>
      )}
    </MessagePartStoryFrame>
  ),
};

function StoryGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="gap-2.5">
      <Text className="font-semibold text-muted-foreground text-sm">{title}</Text>
      {children}
    </View>
  );
}

function StoryExample({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-foreground-tertiary text-sm">{title}</Text>
      {children}
    </View>
  );
}
