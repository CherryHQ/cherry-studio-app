import { Composer, type ComposerAttachment, type ComposerProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

// Remote placeholders: the strip's swell/shrink is the point of this story, and
// it animates identically whether or not the images resolve on device.
const sampleAttachments: ComposerAttachment[] = [
  { id: 'photo-1', name: 'Sunrise', uri: 'https://picsum.photos/id/1015/240/240' },
  { id: 'photo-2', name: 'Harbor', uri: 'https://picsum.photos/id/1016/240/240' },
  { id: 'photo-3', name: 'Forest', uri: 'https://picsum.photos/id/1018/240/240' },
];

type ThemePreviewProps = {
  args: ComposerProps;
  label: string;
  theme: 'dark' | 'light';
};

/**
 * Owns the composer's controlled state so the story exercises the real flow:
 * type, attach, send (which clears), and the send/stop flip.
 */
function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);
  const [attachments, setAttachments] = useState<readonly ComposerAttachment[]>(
    args.attachments ?? [],
  );

  const addAttachment = () => {
    const next = sampleAttachments.find(
      (candidate) => !attachments.some((current) => current.id === candidate.id),
    );

    if (next) {
      setAttachments([...attachments, next]);
    }

    args.onLeadingPress?.();
  };

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <Composer
          {...args}
          attachments={attachments}
          onAttachmentRemove={(id) => {
            setAttachments(attachments.filter((attachment) => attachment.id !== id));
            args.onAttachmentRemove?.(id);
          }}
          onChangeText={(text) => {
            setValue(text);
            args.onChangeText(text);
          }}
          onLeadingPress={addAttachment}
          onSend={() => {
            setValue('');
            setAttachments([]);
            args.onSend();
          }}
          value={value}
        />
        <Text className="text-sm text-muted-foreground">
          Tap ＋ to attach, ✕ to remove, ↑ to send.
        </Text>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Composer',
  component: Composer,
  args: {
    attachments: [],
    autoFocus: false,
    onAttachmentRemove: fn(),
    onChangeText: fn(),
    onLeadingPress: fn(),
    onSend: fn(),
    onStop: fn(),
    placeholder: 'Chat With Cherry Studio',
    streaming: false,
    value: '',
  },
  argTypes: {
    autoFocus: { control: 'boolean' },
    placeholder: { control: 'text' },
    streaming: { control: 'boolean' },
    value: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4 p-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof Composer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};

export const WithAttachments: Story = {
  args: { attachments: sampleAttachments.slice(0, 2), value: 'What is in these photos?' },
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};

export const Streaming: Story = {
  args: { streaming: true, value: '' },
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
