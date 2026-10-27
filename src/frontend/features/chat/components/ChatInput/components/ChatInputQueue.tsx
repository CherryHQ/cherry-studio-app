import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ActionMenu, Button, Surface, useToast } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import { AgentProtocolError } from '@/shared/contracts/agent';
import type {
  AgentEditQueuedInputResult,
  AgentMoveQueuedInputResult,
  AgentQueuedInput,
} from '@/shared/contracts/agent';

import { useAgentChatClient, useAgentQueuedInputs } from '../../../runtime';
import { QueuedInputEditor, QueuedInputPreview, type QueuedInputBuffer } from './QueuedInputSheets';

const conflictKeys = {
  'stale-text': 'chat.queue.staleText',
  'authored-text-unlocatable': 'chat.queue.resend',
  'invalid-text-layout': 'chat.queue.resend',
  'reference-conflict': 'chat.queue.referencesChanged',
  'empty-message': 'chat.queue.emptyMessage',
  'mutation-id-reused': 'chat.queue.mutationFailed',
  'stale-neighbor': 'chat.queue.moveChanged',
  boundary: 'chat.queue.moveChanged',
  'different-lane': 'chat.queue.moveChanged',
} as const;
const inputKey = (sessionId: string, turnId: string) => JSON.stringify([sessionId, turnId]);

export function ChatInputQueue({ sessionId }: { sessionId?: string }) {
  const inputs = useAgentQueuedInputs(sessionId);
  const { client } = useAgentChatClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  // This owner remains mounted even when admission empties the row list.
  const [buffers, setBuffers] = useState<Record<string, QueuedInputBuffer>>({});
  const [editorKey, setEditorKey] = useState<string>();
  const [preview, setPreview] = useState<AgentQueuedInput>();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const locks = useRef(new Set<string>());
  const buffer = editorKey ? buffers[editorKey] : undefined;
  const changeBuffer = (key: string, change: Partial<QueuedInputBuffer>) =>
    setBuffers((previous) => ({ ...previous, [key]: { ...previous[key]!, ...change } }));

  async function run(key: string, operation: () => Promise<void>) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setPending((previous) => ({ ...previous, [key]: true }));
    try {
      await operation();
    } finally {
      locks.current.delete(key);
      setPending((previous) => ({ ...previous, [key]: false }));
    }
  }
  function outcome(result: AgentEditQueuedInputResult | AgentMoveQueuedInputResult) {
    if (result.status === 'already-started') return 'chat.queue.alreadyStarted';
    if (result.status === 'not-found') return 'chat.queue.notFound';
    if (result.status === 'conflict') return conflictKeys[result.reason];
    return undefined;
  }
  function save(key: string, saved: QueuedInputBuffer) {
    if (saved.parts.length === 0) return;
    const hasFile = saved.input.userMessage.parts.some((part) => part.type === 'file');
    if (!hasFile && saved.parts.every((part) => !part.text.trim())) {
      changeBuffer(key, { error: 'chat.queue.emptyMessage' });
      return;
    }
    void run(key, async () => {
      try {
        const result = await client.editQueuedInput(saved.sessionId, {
          turnId: saved.input.turnId,
          assistantMessageId: saved.input.assistantMessageId,
          mutationId: uuidv7(),
          parts: saved.parts,
        });
        const error = outcome(result);
        if (error) {
          changeBuffer(key, { error });
          toast.show({ label: t(error) });
        } else {
          setEditorKey((current) => (current === key ? undefined : current));
          setBuffers((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
          });
          toast.show({ label: t('chat.queue.saved'), variant: 'success' });
        }
      } catch (error) {
        changeBuffer(key, { error: 'chat.queue.mutationFailed' });
        toast.show({
          label: t('chat.queue.mutationFailed'),
          variant: 'danger',
          actions:
            error instanceof AgentProtocolError && error.view.retryable
              ? [{ label: t('common.retry'), onPress: () => save(key, saved) }]
              : undefined,
        });
      }
    });
  }
  function edit(input: AgentQueuedInput) {
    if (!sessionId) return;
    const key = inputKey(sessionId, input.turnId);
    setBuffers((previous) =>
      previous[key]
        ? previous
        : {
            ...previous,
            [key]: {
              sessionId,
              input,
              parts: input.userMessage.parts.flatMap((part) =>
                part.type === 'text'
                  ? [{ partId: part.id, expectedText: part.text, text: part.text }]
                  : [],
              ),
            },
          },
    );
    setEditorKey(key);
  }
  function move(input: AgentQueuedInput, direction: 'earlier' | 'later') {
    if (!sessionId || input.moveTargets[direction] === null) return;
    const targetSession = sessionId;
    const key = inputKey(targetSession, input.turnId);
    const request = {
      turnId: input.turnId,
      assistantMessageId: input.assistantMessageId,
      direction,
      expectedNeighborAssistantMessageId: input.moveTargets[direction],
    };
    const attempt = () =>
      void run(key, async () => {
        try {
          const result = await client.moveQueuedInput(targetSession, {
            ...request,
            mutationId: uuidv7(),
          });
          const error = outcome(result);
          toast.show({
            label: t(error ?? 'chat.queue.moved'),
            variant: error ? undefined : 'success',
          });
        } catch (error) {
          toast.show({
            label: t('chat.queue.mutationFailed'),
            variant: 'danger',
            actions:
              error instanceof AgentProtocolError && error.view.retryable
                ? [{ label: t('common.retry'), onPress: attempt }]
                : undefined,
          });
        }
      });
    attempt();
  }
  function remove(input: AgentQueuedInput) {
    if (!sessionId) return;
    const targetSession = sessionId;
    void run(inputKey(targetSession, input.turnId), async () => {
      try {
        const result = await client.cancelQueuedInput(targetSession, input.turnId);
        if (result === 'already-started') toast.show({ label: t('chat.queue.alreadyStarted') });
      } catch {
        toast.show({ label: t('chat.queue.removeFailed'), variant: 'danger' });
      }
    });
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
            {/* Native ScrollView cancels body taps on drag. Only sheet text is selectable. */}
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
                  pending={!!pending[inputKey(sessionId, input.turnId)]}
                  onPreview={() => setPreview(input)}
                  onEdit={() => edit(input)}
                  onMove={(direction) => move(input, direction)}
                  onRemove={() => remove(input)}
                />
              ))}
            </ScrollView>
          </View>
        </Surface>
      ) : null}
      {preview ? (
        <QueuedInputPreview input={preview} onClose={() => setPreview(undefined)} />
      ) : null}
      {buffer && editorKey ? (
        <QueuedInputEditor
          buffer={buffer}
          latest={
            buffer.sessionId === sessionId
              ? inputs.find((input) => input.turnId === buffer.input.turnId)
              : undefined
          }
          pending={!!pending[editorKey]}
          onClose={() => setEditorKey(undefined)}
          onChange={(partId, text) =>
            changeBuffer(editorKey, {
              parts: buffer.parts.map((part) =>
                part.partId === partId ? { ...part, text } : part,
              ),
              error: undefined,
            })
          }
          onSave={() => save(editorKey, buffer)}
        />
      ) : null}
    </>
  );
}

function QueuedInputRow({
  input,
  position,
  pending,
  onPreview,
  onEdit,
  onMove,
  onRemove,
}: {
  input: AgentQueuedInput;
  position: number;
  pending: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onMove: (direction: 'earlier' | 'later') => void;
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
        className="min-h-11 min-w-0 flex-1 justify-center"
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
      <ActionMenu
        items={[
          { id: 'edit', label: t('common.edit'), disabled: pending, onPress: onEdit },
          {
            id: 'earlier',
            label: t('chat.queue.moveEarlier'),
            disabled: pending || input.moveTargets.earlier === null,
            onPress: () => onMove('earlier'),
          },
          {
            id: 'later',
            label: t('chat.queue.moveLater'),
            disabled: pending || input.moveTargets.later === null,
            onPress: () => onMove('later'),
          },
          {
            id: 'remove',
            label: t('common.remove'),
            disabled: pending,
            destructive: true,
            onPress: onRemove,
          },
        ]}
      >
        <Button
          accessibilityRole="button"
          accessibilityLabel={t('chat.queue.actions', { position })}
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          icon={<EllipsisIcon className="text-muted-foreground" />}
          shape="pill"
          size="lg"
          variant="ghost"
          testID={`queue-actions-${input.turnId}`}
        />
      </ActionMenu>
    </View>
  );
}
