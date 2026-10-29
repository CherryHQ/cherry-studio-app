import XIcon from '@cherrystudio/app-icons/icons/x';
import { Alert, Button, Surface, useToast } from '@cherrystudio/ui/components';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { AgentQueuedInput } from '@/shared/contracts/agent';
import { fileEntryUrl } from '@/shared/data/types/file';

import { useAgentChatClient, useAgentQueuedInputs } from '../../../runtime';
import { QueuedInputPreview } from './QueuedInputSheets';

export function ChatInputQueue({ sessionId }: { sessionId?: string }) {
  const inputs = useAgentQueuedInputs(sessionId);
  const { t } = useTranslation();
  const { client } = useAgentChatClient();
  const { toast } = useToast();
  const composer = useComposerState();
  const { setDraft, setAttachments } = useComposerActions();
  const [preview, setPreview] = useState<AgentQueuedInput>();
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const locks = useRef(new Set<string>());
  const withdrawn = useRef(new Set<string>());
  const latest = useRef({ composer, sessionId, mounted: true });
  useLayoutEffect(() => {
    latest.current = { composer, sessionId, mounted: true };
    return () => {
      latest.current.mounted = false;
    };
  }, [composer, sessionId]);
  const [previewSession, setPreviewSession] = useState(sessionId);
  if (previewSession !== sessionId) {
    setPreviewSession(sessionId);
    setPreview(undefined);
    setConflict(false);
  }

  async function withdraw(input: AgentQueuedInput, restore: boolean) {
    if (!sessionId || (restore && latest.current.composer.isSubmitting)) return;
    const targetSession = sessionId;
    const key = JSON.stringify([targetSession, input.turnId]);
    if (locks.current.has(key) || (!restore && withdrawn.current.has(key))) return;
    locks.current.add(key);
    setPending((previous) => ({ ...previous, [input.turnId]: true }));
    const before = latest.current.composer;
    let completed = false;
    try {
      // If newer composer content delayed restoration, retry only that local restoration.
      const result = withdrawn.current.has(key)
        ? 'withdrawn'
        : await client.cancelQueuedInput(targetSession, input.turnId);
      if (result !== 'withdrawn') {
        toast.show({
          label: t(
            result === 'already-started' ? 'chat.queue.alreadyStarted' : 'chat.queue.notFound',
          ),
        });
        return;
      }
      withdrawn.current.add(key);
      if (restore) {
        // A late result must never replace another Session's draft or newer composer content.
        const current = latest.current;
        if (!current.mounted || current.sessionId !== targetSession) return;
        if (
          current.composer.draft !== before.draft ||
          current.composer.attachments !== before.attachments
        ) {
          toast.show({ label: t('chat.queue.draftChanged'), variant: 'danger' });
          return;
        }
        const attachments = input.userMessage.parts.flatMap<ComposerAttachmentDraft>((part) =>
          part.type === 'file'
            ? [
                {
                  id: part.id,
                  fileEntryId: part.fileEntryId,
                  kind: part.mediaType.startsWith('image/') ? 'image' : 'file',
                  mediaType: part.mediaType,
                  name: part.filename ?? t('chat.queue.message'),
                  status: 'ready',
                  uri: fileEntryUrl(part.fileEntryId),
                },
              ]
            : [],
        );
        setDraft(
          input.userMessage.parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n'),
        );
        setAttachments(attachments);
      }
      completed = true;
      if (latest.current.sessionId === targetSession) {
        setPreview((current) => (current?.turnId === input.turnId ? undefined : current));
      }
    } catch {
      toast.show({
        label: t(restore ? 'chat.queue.takeBackFailed' : 'chat.queue.removeFailed'),
        variant: 'danger',
      });
    } finally {
      // Keep completed actions locked until their rows disappear from the subscription.
      if (!completed) locks.current.delete(key);
      setPending((previous) => ({ ...previous, [input.turnId]: false }));
    }
  }

  function takeBack() {
    if (!preview || composer.isSubmitting || pending[preview.turnId]) return;
    if (locks.current.has(JSON.stringify([sessionId, preview.turnId]))) return;
    if (composer.draft.length > 0 || composer.attachments.length > 0) {
      setConflict(true);
    } else {
      void withdraw(preview, true);
    }
  }

  return (
    <>
      {sessionId && inputs.length > 0 ? (
        <Surface testID="chat-input-queue">
          <View className="px-3 pb-1 pt-3">
            <View className="flex-row items-center gap-2 px-1 pb-1">
              <Text
                accessibilityRole="header"
                className="text-xs font-medium text-muted-foreground"
              >
                {t('chat.queue.title')}
              </Text>
              <View className="min-w-5 items-center rounded-full bg-secondary px-1.5">
                <Text className="text-xs font-medium tabular-nums text-muted-foreground">
                  {inputs.length}
                </Text>
              </View>
            </View>
            {/* Native scrolling cancels row taps; only detail text is selectable. */}
            <ScrollView
              className="max-h-40"
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {inputs.map((input, index) => (
                <QueuedInputRow
                  key={input.turnId}
                  input={input}
                  position={index + 1}
                  pending={!!pending[input.turnId]}
                  onPreview={() => setPreview(input)}
                  onRemove={() => void withdraw(input, false)}
                />
              ))}
            </ScrollView>
          </View>
        </Surface>
      ) : null}
      {preview ? (
        <QueuedInputPreview
          input={preview}
          pending={!!pending[preview.turnId] || composer.isSubmitting}
          onClose={() => setPreview(undefined)}
          onRemove={() => void withdraw(preview, false)}
          onTakeBack={takeBack}
        />
      ) : null}
      <Alert
        isOpen={conflict}
        onOpenChange={setConflict}
        title={t('chat.queue.draftConflict')}
        actions={[
          {
            label: t('chat.queue.replaceDraft'),
            role: 'destructive',
            onPress: () => {
              setConflict(false);
              if (preview) void withdraw(preview, true);
            },
          },
          { label: t('chat.queue.keepDraft'), onPress: () => setConflict(false) },
          {
            label: t('chat.queue.cancelTakeBack'),
            role: 'cancel',
            onPress: () => setConflict(false),
          },
        ]}
      />
    </>
  );
}

function QueuedInputRow({
  input,
  position,
  pending,
  onPreview,
  onRemove,
}: {
  input: AgentQueuedInput;
  position: number;
  pending: boolean;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const text = input.userMessage.parts
    .flatMap((part) => (part.type === 'text' ? [part.text.slice(0, 240)] : []))
    .join('\n')
    .slice(0, 240)
    .trim();
  const attachments = input.userMessage.parts
    .flatMap((part) => (part.type === 'file' ? [part.filename ?? t('chat.queue.message')] : []))
    .join(' · ');
  return (
    <View
      className={`min-h-10 flex-row items-center gap-3 px-1 py-1.5 ${position > 1 ? 'border-t border-border-subtle' : ''}`}
    >
      <Text className="min-w-4 text-center text-xs tabular-nums text-muted-foreground">
        {position}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.queue.openPreview', { position })}
        className="min-w-0 flex-1"
        onPress={onPreview}
        testID={`queue-preview-${input.turnId}`}
      >
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {text || attachments || t('chat.queue.message')}
        </Text>
        {text && attachments ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {attachments}
          </Text>
        ) : null}
      </Pressable>
      <Button
        accessibilityLabel={t('chat.queue.remove', { position })}
        disabled={pending}
        icon={<XIcon className="text-muted-foreground" />}
        loading={pending}
        onPress={onRemove}
        shape="pill"
        size="xs"
        variant="ghost"
        testID={`chat-input-queue-remove-${input.turnId}`}
      />
    </View>
  );
}
