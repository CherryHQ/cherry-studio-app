import XIcon from '@cherrystudio/app-icons/icons/x';
import { Alert, Button, Surface, useToast } from '@cherrystudio/ui/components';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { AgentQueuedInput } from '@/shared/contracts/agent';
import { fileEntryUrl } from '@/shared/data/types/file';

import { useChatQuoteActions, useChatQuoteState } from '../../../quotes/ChatQuoteContext';
import { messageQuoteLine } from '../../../quotes/MessageQuotePreview';
import { useAgentChatClient, useAgentQueuedInputs } from '../../../runtime';
import { QueuedInputPreview } from './QueuedInputSheets';

export function ChatInputQueue({ sessionId }: { sessionId?: string }) {
  const inputs = useAgentQueuedInputs(sessionId);
  const { t } = useTranslation();
  const { client } = useAgentChatClient();
  const { toast } = useToast();
  const composer = useComposerState();
  const { setDraft, setAttachments } = useComposerActions();
  const quoteActions = useChatQuoteActions();
  const quote = useChatQuoteState().fields;
  const [preview, setPreview] = useState<AgentQueuedInput>();
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const locks = useRef(new Set<string>());
  const withdrawn = useRef(new Set<string>());
  const latest = useRef({ composer, quote, sessionId, mounted: true });
  useLayoutEffect(() => {
    latest.current = { composer, quote, sessionId, mounted: true };
    return () => {
      latest.current.mounted = false;
    };
  }, [composer, quote, sessionId]);
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
    const before = latest.current;
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
          current.composer.draft !== before.composer.draft ||
          current.composer.attachments !== before.composer.attachments ||
          current.quote !== before.quote
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
        const quoted = input.userMessage.parts.find((part) => part.type === 'text' && part.quotes);
        quoteActions?.restoreQuote(quoted?.type === 'text' ? quoted : {});
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
    if (composer.draft.length > 0 || composer.attachments.length > 0 || quote.quotes?.length) {
      setConflict(true);
    } else {
      void withdraw(preview, true);
    }
  }

  return (
    <>
      {sessionId && inputs.length > 0 ? (
        <Surface testID="chat-input-queue">
          <View className="py-1 pl-4 pr-2">
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
  const quote = input.userMessage.parts.flatMap((part) => {
    const line = part.type === 'text' ? messageQuoteLine(part, t) : undefined;
    return line ? [line] : [];
  })[0];
  // One quiet line under the request: what it carries besides its own words.
  const detail = [text ? attachments : '', quote].filter(Boolean).join(' · ');
  return (
    <View className="min-h-10 flex-row items-center gap-2">
      {/* Sending order: the first row is the next to run. */}
      <Text className="min-w-3 self-start py-2.5 text-sm tabular-nums text-muted-foreground">
        {position}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.queue.openPreview', { position })}
        className="min-w-0 flex-1 py-2.5"
        onPress={onPreview}
        testID={`queue-preview-${input.turnId}`}
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
