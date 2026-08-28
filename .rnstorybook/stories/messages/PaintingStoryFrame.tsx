import { Image, ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

import type { MessageListItem } from '@/frontend/components/messages';
import {
  PaintingMessage,
  type PaintingMessageState,
} from '@/frontend/features/paintings/components/PaintingMessage';

import { STORY_FILE_ENTRY_ID } from './messageFixtures';
import { MessagesStoryProviders } from './MessagesStoryProviders';

export type PaintingExample = {
  label: string;
  message: MessageListItem;
  state: PaintingMessageState;
};

const firstOutputUri = Image.resolveAssetSource(
  require('../../../assets/paintings/templates/cherry-twilight.png'),
).uri;
const secondOutputUri = Image.resolveAssetSource(
  require('../../../assets/paintings/templates/cyber-rabbit-character.webp'),
).uri;

const baseState = {
  aspectRatio: 1,
  error: null,
  interruption: null,
  outputs: [],
  resolution: '1024 × 1024',
  status: 'idle',
} as const satisfies PaintingMessageState;

const paintingUserMessage: MessageListItem = {
  data: {
    parts: [
      {
        filename: 'reference.png',
        mediaType: 'image/png',
        providerMetadata: { cherry: { fileEntryId: STORY_FILE_ENTRY_ID } },
        type: 'file',
        url: 'file:///storybook/reference.png',
      },
      {
        state: 'done',
        text: 'Create a cinematic cherry-red city at twilight.',
        type: 'text',
      },
    ],
  },
  id: 'painting-user',
  role: 'user',
  status: 'success',
};

function assistantMessage(id: string, status: MessageListItem['status']): MessageListItem {
  return { data: { parts: [] }, id, role: 'assistant', status };
}

export const paintingExamples: readonly PaintingExample[] = [
  {
    label: 'Painting user prompt and reference',
    message: paintingUserMessage,
    state: baseState,
  },
  {
    label: 'Generating',
    message: assistantMessage('painting-generating', 'pending'),
    state: { ...baseState, status: 'generating' },
  },
  {
    label: 'Single result',
    message: assistantMessage('painting-single-result', 'success'),
    state: {
      ...baseState,
      outputs: [{ fileEntryId: 'painting-output-1', uri: firstOutputUri }],
    },
  },
  {
    label: 'Multiple results',
    message: assistantMessage('painting-multiple-results', 'success'),
    state: {
      ...baseState,
      outputs: [
        { fileEntryId: 'painting-output-2', uri: firstOutputUri },
        { fileEntryId: 'painting-output-3', uri: secondOutputUri },
      ],
    },
  },
  {
    label: 'Failed',
    message: assistantMessage('painting-failed', 'error'),
    state: { ...baseState, error: new Error('The image provider rejected the request.') },
  },
  {
    label: 'Interrupted',
    message: assistantMessage('painting-interrupted', 'error'),
    state: {
      ...baseState,
      interruption: { message: 'Generation stopped before an image was produced.' },
    },
  },
  {
    label: 'Idle without output (renders no assistant content)',
    message: assistantMessage('painting-empty', 'success'),
    state: baseState,
  },
];

export function PaintingStoryFrame({
  examples,
  theme,
}: {
  examples: readonly PaintingExample[];
  theme: 'dark' | 'light';
}) {
  return (
    <ScopedTheme theme={theme}>
      <MessagesStoryProviders>
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-5 py-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          {examples.map(({ label, message, state }) => (
            <View className="gap-2 px-4" key={message.id}>
              <Text className="font-medium text-foreground-tertiary text-sm">{label}</Text>
              <PaintingMessage message={message} state={state} />
            </View>
          ))}
        </ScrollView>
      </MessagesStoryProviders>
    </ScopedTheme>
  );
}
