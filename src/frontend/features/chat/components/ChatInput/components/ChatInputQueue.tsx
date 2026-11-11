import ArrowUpIcon from '@cherrystudio/app-icons/icons/arrow-up';
import ArrowUpDownIcon from '@cherrystudio/app-icons/icons/arrow-up-down';
import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import PlayIcon from '@cherrystudio/app-icons/icons/play';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  Alert,
  BottomSheet,
  Button,
  ReorderList,
  Surface,
  useToast,
} from '@cherrystudio/ui/components';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';

import { useChatQuoteActions } from '../../../quotes/ChatQuoteContext';
import { messageQuoteLine } from '../../../quotes/MessageQuotePreview';
import type { FollowupQueueItem } from '../../../runtime/followupQueue';
import type { FollowupQueueController } from '../../../runtime/useFollowupQueue';
import { QueuedInputPreview } from './QueuedInputSheets';

function previewText(input: FollowupQueueItem) {
  return input.request.parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
    .trim()
    .slice(0, 240);
}

export function ChatInputQueue({ queue }: { queue: FollowupQueueController }) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const { toast } = useToast();
  const composer = useComposerState();
  const { setDraft, setAttachments } = useComposerActions();
  const quoteActions = useChatQuoteActions();
  const [previewId, setPreviewId] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [sorting, setSorting] = useState(false);
  const preview = queue.items.find((item) => item.id === previewId);
  const pending = !!queue.pendingId || composer.isSubmitting;

  useEffect(() => {
    if (queue.hasFailedSend) toast.show({ label: t('chat.queue.sendFailed'), variant: 'danger' });
  }, [queue.hasFailedSend, t, toast]);

  function takeBack() {
    if (!preview || pending) return;
    const item = queue.remove(preview.id);
    if (!item) return;
    setDraft(item.draft.text);
    setAttachments([...item.draft.attachments]);
    quoteActions?.restoreQuote(item.draft.quote);
    setPreviewId(undefined);
  }

  return (
    <>
      {queue.items.length > 0 ? (
        <Surface testID="chat-input-queue">
          <View className="flex-row items-center gap-1 px-2 pt-1">
            <Text className="flex-1 pl-2 text-xs text-muted-foreground">
              {t(queue.isPaused ? 'chat.queue.paused' : 'chat.queue.title')}
            </Text>
            {queue.items.length > 1 ? (
              <Button
                accessibilityLabel={t('chat.queue.reorder')}
                disabled={pending}
                icon={<ArrowUpDownIcon />}
                onPress={() => setSorting(true)}
                size="xs"
                variant="ghost"
                testID="queue-reorder"
              />
            ) : null}
            <Button
              accessibilityLabel={t(queue.isPaused ? 'chat.queue.resume' : 'chat.queue.pause')}
              icon={queue.isPaused ? <PlayIcon /> : <PauseIcon />}
              onPress={() => queue.setPaused(!queue.isPaused)}
              size="xs"
              variant="ghost"
              testID="queue-toggle-pause"
            />
          </View>
          <ScrollView
            className="max-h-40"
            contentContainerClassName="py-1 pl-4 pr-2"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {queue.items.map((input, index) => (
              <QueuedInputRow
                key={input.id}
                input={input}
                position={index + 1}
                pending={pending}
                isSending={queue.pendingId === input.id}
                canSend={queue.canSend}
                onPreview={() => setPreviewId(input.id)}
                onRemove={() => queue.remove(input.id)}
                onSend={() => {
                  void queue.send(input.id);
                }}
              />
            ))}
          </ScrollView>
        </Surface>
      ) : null}
      {preview ? (
        <QueuedInputPreview
          input={preview}
          pending={pending}
          canSend={queue.canSend}
          onSend={() => {
            void queue.send(preview.id);
          }}
          onClose={() => setPreviewId(undefined)}
          onRemove={() => queue.remove(preview.id)}
          onTakeBack={() => {
            if (composer.draft.length || composer.attachments.length) setConflict(true);
            else takeBack();
          }}
        />
      ) : null}
      <Alert
        isOpen={conflict && !!preview}
        onOpenChange={setConflict}
        title={t('chat.queue.draftConflict')}
        actions={[
          {
            label: t('chat.queue.replaceDraft'),
            role: 'destructive',
            onPress: () => {
              setConflict(false);
              takeBack();
            },
          },
          {
            label: t('chat.queue.cancelTakeBack'),
            role: 'cancel',
            onPress: () => setConflict(false),
          },
        ]}
      />
      <BottomSheet
        open={sorting && focused && queue.items.length > 0}
        onClose={() => setSorting(false)}
        size="medium"
        title={t('chat.queue.reorder')}
        closeAction={{ accessibilityLabel: t('common.close') }}
      >
        <ScrollView contentContainerClassName="p-5">
          <ReorderList
            items={queue.items}
            getItemKey={(item) => item.id}
            getItemLabel={(item) => previewText(item) || t('chat.queue.message')}
            labels={{
              moveUp: (item) =>
                t('common.moveUp', { name: previewText(item) || t('chat.queue.message') }),
              moveDown: (item) =>
                t('common.moveDown', { name: previewText(item) || t('chat.queue.message') }),
            }}
            onReorder={queue.reorder}
          />
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function QueuedInputRow({
  input,
  position,
  pending,
  isSending,
  canSend,
  onPreview,
  onRemove,
  onSend,
}: {
  input: FollowupQueueItem;
  position: number;
  pending: boolean;
  isSending: boolean;
  canSend: boolean;
  onPreview: () => void;
  onRemove: () => void;
  onSend: () => void;
}) {
  const { t } = useTranslation();
  const text = previewText(input);
  const attachments = input.request.parts
    .flatMap((part) => (part.type === 'file' ? [part.filename ?? t('chat.queue.message')] : []))
    .join(' · ');
  const quote = input.request.parts.flatMap((part) => {
    const line =
      part.type === 'text'
        ? messageQuoteLine({ ...part, quotes: part.quotes?.filter((item) => !item.reference) }, t)
        : undefined;
    return line ? [line] : [];
  })[0];
  const detail = [text ? attachments : '', quote].filter(Boolean).join(' · ');
  return (
    <View className="min-h-10 flex-row items-center gap-2">
      <Text className="min-w-3 self-start py-2.5 text-sm tabular-nums text-muted-foreground">
        {position}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.queue.openPreview', { position })}
        className="min-w-0 flex-1 py-2.5"
        onPress={onPreview}
        testID={`queue-preview-${input.id}`}
      >
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {text || attachments || t('chat.queue.message')}
        </Text>
        {detail ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
      <Button
        accessibilityLabel={t('chat.queue.send')}
        disabled={!canSend || pending}
        loading={isSending}
        icon={<ArrowUpIcon />}
        onPress={onSend}
        shape="pill"
        size="xs"
        variant="ghost"
        testID={`queue-send-${input.id}`}
      />
      <Button
        accessibilityLabel={t('chat.queue.remove', { position })}
        disabled={pending}
        icon={<XIcon className="text-muted-foreground" />}
        onPress={onRemove}
        shape="pill"
        size="xs"
        variant="ghost"
        testID={`chat-input-queue-remove-${input.id}`}
      />
    </View>
  );
}
