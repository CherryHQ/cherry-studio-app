import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import FileIcon from '@cherrystudio/app-icons/icons/file';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import SlidersHorizontalIcon from '@cherrystudio/app-icons/icons/sliders-horizontal';
import SparklesIcon from '@cherrystudio/app-icons/icons/sparkles';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  Composer,
  type ComposerInputHandle,
  type ComposerProps,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

type StoryAttachment = { id: string; name: string; uri: string };

// Remote placeholders: the row's swell/shrink is the point of this story, and it
// animates identically whether or not the images resolve on device.
const sampleAttachments: StoryAttachment[] = [
  { id: 'photo-1', name: 'Sunrise', uri: 'https://picsum.photos/id/1015/240/240' },
  { id: 'photo-2', name: 'Harbor', uri: 'https://picsum.photos/id/1016/240/240' },
  { id: 'photo-3', name: 'Forest', uri: 'https://picsum.photos/id/1018/240/240' },
];

/**
 * Deliberately written here rather than shipped by the package: every real
 * consumer wants a different strip (images and files, horizontal scrolling, tap
 * to preview), and `Composer.Collapsible` is the part that is actually general.
 */
function AttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: readonly StoryAttachment[];
  onRemove: (id: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2 pt-0.5 pb-2">
      {attachments.map((attachment) => (
        <View
          accessibilityLabel={attachment.name}
          className="size-20 overflow-hidden rounded-2xl bg-surface-secondary"
          key={attachment.id}
        >
          <Image className="size-20" resizeMode="cover" source={{ uri: attachment.uri }} />
          <Pressable
            accessibilityLabel={`Remove ${attachment.name}`}
            accessibilityRole="button"
            className="absolute top-1.5 right-1.5 size-6 items-center justify-center rounded-full bg-black/55 active:opacity-70"
            hitSlop={8}
            onPress={() => onRemove(attachment.id)}
          >
            <XIcon className="size-3.5 text-white" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

type PreviewState = {
  attach: () => void;
  attachments: readonly StoryAttachment[];
  /** Handed back out because the field is the caller's to place, and `mention` needs it. */
  inputRef: RefObject<ComposerInputHandle | null>;
  /** Inserts a tool mention at the caret, the way a real ＋ menu row would. */
  mention: () => void;
  remove: (id: string) => void;
  value: string;
};

// A mention is a link, so it is styled by what its URL means rather than by
// where it sits. `^tool:` is this story's scheme for one.
const markdownStyle = {
  link: { color: '#ff5757', underline: false },
  linkVariants: { '^tool:': { color: '#ff5757', underline: false } },
};

type ThemePreviewProps = {
  args: ComposerProps;
  /** Given the live state, since the preview owns it and `args` only carries the initial value. */
  children?: (state: PreviewState) => ReactNode;
  hint: string;
  label: string;
  theme: 'dark' | 'light';
};

/**
 * The switch row. Holds its own state so the story shows the setting persisting
 * across opens — the row closes the menu like any other, so the only way to see
 * where it landed is to reopen it.
 */
function WebSearchToggleRow() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Composer.Menu.Toggle
      icon={<GlobeIcon className="size-5 text-foreground" />}
      label="Web search"
      onValueChange={setEnabled}
      value={enabled}
    />
  );
}

/**
 * Owns the composer's controlled state so the story exercises the real flow:
 * type, attach, send (which clears), and the send/stop flip.
 */
function ThemePreview({ args, children, hint, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);
  const [attachments, setAttachments] = useState<readonly StoryAttachment[]>([]);
  const inputRef = useRef<ComposerInputHandle>(null);

  const mention = () => {
    inputRef.current?.insertLink('Create image', 'tool://create-image');
    inputRef.current?.insertText(' ');
  };

  const attach = () => {
    const next = sampleAttachments.find(
      (candidate) => !attachments.some((current) => current.id === candidate.id),
    );

    if (next) {
      setAttachments([...attachments, next]);
    }
  };

  const remove = (id: string) => {
    setAttachments(attachments.filter((attachment) => attachment.id !== id));
  };

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <Composer
          {...args}
          // Text alone is the built-in rule, so a caller holding attachments has
          // to say so — the composer cannot see them.
          canSend={value.trim().length > 0 || attachments.length > 0}
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
          {children?.({ attach, attachments, inputRef, mention, remove, value })}
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
    autoFocus: false,
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
 * send button. The attachment row is the caller's too — a `Composer.Collapsible`
 * with whatever the caller wants inside it.
 */
export const Composed: Story = {
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="＋ to attach or drop in a mention, sliders for a plain tool, the pill for one that shows its setting."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      >
        {({ attach, attachments, inputRef, mention, remove }) => (
          <>
            <Composer.Collapsible>
              {attachments.length > 0 ? (
                <AttachmentStrip attachments={attachments} onRemove={remove} />
              ) : null}
            </Composer.Collapsible>
            <Composer.Input
              markdownStyle={markdownStyle}
              placeholder={args.placeholder}
              ref={inputRef}
            />
            <Composer.Toolbar>
              <Composer.Menu accessibilityLabel="Add attachment">
                <Composer.Menu.Item
                  icon={<CameraIcon className="size-5 text-foreground" />}
                  label="Camera"
                  onPress={attach}
                />
                <Composer.Menu.Item
                  icon={<ImagesIcon className="size-5 text-foreground" />}
                  label="Photos"
                  onPress={attach}
                />
                <Composer.Menu.Item
                  icon={<FileIcon className="size-5 text-foreground" />}
                  label="File"
                  onPress={attach}
                />
                {/* Nothing is written into `value` here: the row hands the
                    field a link, and the field hands back the Markdown for it. */}
                <Composer.Menu.Item
                  icon={<SparklesIcon className="size-5 text-foreground" />}
                  label="Create image"
                  onPress={mention}
                />
                <WebSearchToggleRow />
              </Composer.Menu>
              <Composer.Action accessibilityLabel="Settings" onPress={fn()}>
                <SlidersHorizontalIcon className="size-6 text-foreground" />
              </Composer.Action>
              <Composer.Pill
                accessibilityLabel="Change model"
                icon={<SparklesIcon className="size-4 text-foreground" />}
                onPress={fn()}
              >
                <Text
                  className="min-w-0 shrink font-semibold text-foreground text-sm"
                  numberOfLines={1}
                >
                  Claude Opus
                </Text>
                <Text className="shrink-0 text-muted-foreground text-sm">High</Text>
              </Composer.Pill>
              <Composer.Send />
            </Composer.Toolbar>
          </>
        )}
      </ThemePreview>
    )),
};

/**
 * Any row can swell and shrink, not just attachments — render `null` to collapse
 * it and the surface follows.
 */
export const StatusRow: Story = {
  render: (args) =>
    bothThemes((theme) => (
      <ThemePreview
        args={args}
        hint="Type to raise the status row; clear the field to watch it collapse."
        key={theme.value}
        label={theme.label}
        theme={theme.value}
      >
        {({ value }) => (
          <>
            <Composer.Collapsible>
              {value.length > 0 ? (
                <View className="flex-row items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-1.5">
                  <GlobeIcon className="size-4 text-primary" />
                  <Text className="text-sm text-primary">Searching the web…</Text>
                </View>
              ) : null}
            </Composer.Collapsible>
            <Composer.Input placeholder={args.placeholder} />
            <Composer.Toolbar>
              <Composer.Send />
            </Composer.Toolbar>
          </>
        )}
      </ThemePreview>
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
