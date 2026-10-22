import { MarkdownText, MermaidDiagram } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { fn } from 'storybook/test';

import { MessagePartStoryFrame } from '../message-parts/story-frame';

const examples = {
  Flowchart: 'flowchart LR\nA[开始 / Start] --> B{Ready?}\nB -->|Yes| C[完成 / Done]\nB -->|No| A',
  Sequence:
    'sequenceDiagram\nparticipant U as 用户\nparticipant A as Assistant\nU->>A: Hello\nA-->>U: 你好',
  Class:
    'classDiagram\nclass Message {\n+String text\n+render()\n}\nclass Diagram\nMessage --> Diagram',
  State: 'stateDiagram-v2\n[*] --> Loading\nLoading --> Ready\nReady --> [*]',
  Mindmap: 'mindmap\n  root((Cherry))\n    Android\n    iOS\n    图表展示',
  Pie: 'pie title Platforms\n"Android" : 60\n"iOS" : 40',
};
const onLinkPress = fn();

const meta = {
  title: 'Components/Mermaid Diagram',
  component: MermaidDiagram,
  args: { source: examples.Flowchart },
} satisfies Meta<typeof MermaidDiagram>;
export default meta;

type Story = StoryObj<typeof meta>;

export const CommonDiagrams: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() =>
        Object.entries(examples).map(([label, source]) => (
          <View key={label} className="gap-3">
            <Text className="font-semibold text-foreground">{label}</Text>
            <MermaidDiagram source={source} />
          </View>
        ))
      }
    </MessagePartStoryFrame>
  ),
};

export const InMarkdown: Story = {
  render: () => (
    <MessagePartStoryFrame>
      {() => (
        <MarkdownText
          fontSizeStep={0}
          markdown={`Before the diagram: [reference][docs].\n\n\`\`\`mermaid\n${examples.Flowchart}\n\`\`\`\n\nAfter the diagram.\n\n[docs]: https://cherry-ai.com`}
          onLinkPress={onLinkPress}
        />
      )}
    </MessagePartStoryFrame>
  ),
};

export const SourceFallback: Story = { args: { source: 'flowchart LR\nA -->' } };
export const LargeText: Story = { args: { fontSizeStep: 2 } };
