import { Composer, type ComposerAttachment, type ComposerProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { CameraIcon, FileIcon, ImagesIcon, SlidersHorizontalIcon } from 'lucide-uniwind/png';
import { type ReactNode, useState } from 'react';
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
  children?: (attach: () => void) => ReactNode;
  hint: string;
  label: string;
  theme: 'dark' | 'light';
};

/**
 * Owns the composer's controlled state so the story exercises the real flow:
 * type, attach, send (which clears), and the send/stop flip.
 */
function ThemePreview({ args, children, hint, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);
  const [attachments, setAttachments] = useState<readonly ComposerAttachment[]>(
    args.attachments ?? [],
  );

  const attach = () => {
    const next = sampleAttachments.find(
      (candidate) => !attachments.some((current) => current.id === candidate.id),
    );

    if (next) {
      setAttachments([...attachments, next]);
    }
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
          onSend={() => {
            setValue('');
            setAttachments([]);
            args.onSend();
          }}
          value={value}
        >
          {children?.(attach)}
        </Composer>
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      </View>
    </ScopedTheme>
  );
}

function bothThemes(preview: (theme: (typeof themes)[number]) => ReactNode) {
  return <View className="gap-4">{themes.map(preview)}</View>;
}

const meta = {
  title: 'Components/Primitives/Composer',
  component: Composer,
  args: {
    attachments: [],
    autoFocus: false,
    onAttachmentRemove: fn(),
    onChangeText: fn(),
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

/** The default layout: no children, so the toolbar holds nothing but send. */
export const Playground: Story = {
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="Type, then tap ↑ to send. The toolbar is empty until you fill it."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      />
    )),
};

/**
 * The point of the split: tools are the caller's, and adding one never moves the
 * send button.
 */
export const Composed: Story = {
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="Tap ＋ for the menu, the sliders for a plain tool, ↑ to send."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      >
        {(attach) => (
          <>
            <Composer.Attachments />
            <Composer.Input placeholder={args.placeholder} />
            <Composer.Toolbar>
              <Composer.Menu accessibilityLabel="Add attachment">
                <Composer.Menu.Item
                  icon={<CameraIcon className="size-5 text-foreground" strokeWidth={2} />}
                  label="Camera"
                  onPress={attach}
                />
                <Composer.Menu.Item
                  icon={<ImagesIcon className="size-5 text-foreground" strokeWidth={2} />}
                  label="Photos"
                  onPress={attach}
                />
                <Composer.Menu.Item
                  icon={<FileIcon className="size-5 text-foreground" strokeWidth={2} />}
                  label="File"
                  onPress={attach}
                />
              </Composer.Menu>
              <Composer.Action accessibilityLabel="Settings" onPress={fn()}>
                <SlidersHorizontalIcon className="size-6 text-foreground" strokeWidth={2} />
              </Composer.Action>
              <Composer.Send />
            </Composer.Toolbar>
          </>
        )}
      </ThemePreview>
    )),
};

export const WithAttachments: Story = {
  args: { attachments: sampleAttachments.slice(0, 2), value: 'What is in these photos?' },
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="Tap ✕ to remove; the surface shrinks as the strip empties."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      />
    )),
};

export const Streaming: Story = {
  args: { streaming: true, value: '' },
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="The send arrow becomes a stop square while a reply streams in."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      />
    )),
};
