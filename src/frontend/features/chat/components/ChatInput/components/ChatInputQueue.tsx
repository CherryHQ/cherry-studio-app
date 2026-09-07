import {
  ActionMenu,
  BottomSheet,
  Button,
  Input,
  type MenuItem,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useComposerPresentationActions } from '@/frontend/components/Composer';
import type { AgentInputQueueReason, AgentSessionInput } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { parseUniqueModelId } from '@/shared/data/types/model';

import { useAgentChatActions, useAgentInputQueue } from '../../../runtime';
import { shouldShowChatInputQueue } from '../utils/chatInputPresentation';

const logger = loggerService.withContext('ChatInputQueue');
const REASON_KEYS = {
  busy: 'chat.input.queue.reason.busy',
  'target-ended': 'chat.input.queue.reason.targetEnded',
  'configuration-changed': 'chat.input.queue.reason.configurationChanged',
  'unsupported-content': 'chat.input.queue.reason.unsupportedContent',
  'runtime-unavailable': 'chat.input.queue.reason.runtimeUnavailable',
  undelivered: 'chat.input.queue.reason.undelivered',
  interrupted: 'chat.input.queue.reason.interrupted',
  'invalid-input': 'chat.input.queue.reason.invalidInput',
} satisfies Record<AgentInputQueueReason, string>;

export function ChatInputQueue({
  sessionId,
  targetTurnId,
}: {
  sessionId?: string;
  targetTurnId?: string;
}) {
  const { t } = useTranslation();
  const queue = useAgentInputQueue(sessionId);
  const { runInputReplacement } = useComposerPresentationActions();
  const [isOpen, setIsOpen] = useState(false);
  const shouldShowEntry = shouldShowChatInputQueue(queue);

  if (!sessionId || (!shouldShowEntry && !isOpen)) return null;

  return (
    <>
      {shouldShowEntry ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            void runInputReplacement(() => setIsOpen(true));
          }}
        >
          <Button.Label>
            {t(queue.isPaused ? 'chat.input.queue.pausedCount' : 'chat.input.queue.count', {
              count: queue.inputs.length,
            })}
          </Button.Label>
        </Button>
      ) : null}
      {isOpen ? (
        <BottomSheet
          open
          onClose={() => setIsOpen(false)}
          sizes={['large']}
          title={t('chat.input.queue.title')}
        >
          <QueueBody sessionId={sessionId} targetTurnId={targetTurnId} />
        </BottomSheet>
      ) : null}
    </>
  );
}

function QueueBody({ sessionId, targetTurnId }: { sessionId: string; targetTurnId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useAgentChatActions();
  const queue = useAgentInputQueue(sessionId);
  const [editing, setEditing] = useState<AgentSessionInput>();
  const [isWorking, setIsWorking] = useState(false);
  const working = useRef(false);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (working.current) return false;
    working.current = true;
    setIsWorking(true);
    try {
      await action();
      toast.show({ label: t('chat.input.queue.updated'), variant: 'success' });
      return true;
    } catch (error) {
      logger.warn('Queue action failed', error instanceof Error ? error : { error });
      toast.show({ label: t('chat.input.queue.actionFailed'), variant: 'danger' });
      return false;
    } finally {
      working.current = false;
      setIsWorking(false);
    }
  }

  if (editing) {
    return (
      <QueueEditor
        key={editing.id}
        input={editing}
        disabled={isWorking}
        onCancel={() => setEditing(undefined)}
        onSave={async (text) => {
          const parts = [
            ...(text.trim() ? [{ type: 'text' as const, text: text.trim() }] : []),
            ...editing.parts.filter((part) => part.type !== 'text'),
          ];
          if (await run(() => client.editQueuedInput({ sessionId, inputId: editing.id, parts }))) {
            setEditing(undefined);
          }
        }}
      />
    );
  }

  const movable = queue.inputs.filter(
    (input) => input.status === 'queued' || input.status === 'interrupted',
  );
  function move(inputId: string, offset: number) {
    const ids = movable.map((input) => input.id);
    const from = ids.indexOf(inputId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void run(() => client.reorderQueuedInputs({ sessionId, inputIds: ids }));
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-6 pb-6">
      <Text className="text-muted-foreground text-sm">
        {t(queue.isPaused ? 'chat.input.queue.pausedHint' : 'chat.input.queue.runningHint')}
      </Text>
      <Button
        disabled={isWorking}
        variant="secondary"
        onPress={() =>
          void run(() => client.pauseInputQueue({ sessionId, isPaused: !queue.isPaused }))
        }
      >
        <Button.Label>
          {t(queue.isPaused ? 'chat.input.queue.resume' : 'chat.input.queue.pause')}
        </Button.Label>
      </Button>
      {queue.inputs.length === 0 ? (
        <Text className="text-muted-foreground text-sm">{t('chat.input.queue.empty')}</Text>
      ) : null}
      {queue.inputs.map((input) => {
        const canEdit = input.status === 'queued' || input.status === 'interrupted';
        const position = movable.findIndex((candidate) => candidate.id === input.id);
        const items: MenuItem[] = [
          {
            id: 'edit',
            label: t('chat.input.queue.edit'),
            disabled: isWorking || !canEdit,
            onPress: () => setEditing(input),
          },
          {
            id: 'up',
            label: t('chat.input.queue.moveUp'),
            disabled: isWorking || !canEdit || position <= 0,
            onPress: () => move(input.id, -1),
          },
          {
            id: 'down',
            label: t('chat.input.queue.moveDown'),
            disabled: isWorking || !canEdit || position >= movable.length - 1,
            onPress: () => move(input.id, 1),
          },
          {
            id: 'steer',
            label: t('chat.input.queue.steer'),
            disabled:
              isWorking ||
              !targetTurnId ||
              input.status !== 'queued' ||
              input.parts.some((part) => part.type !== 'text'),
            onPress: () => {
              if (!targetTurnId) return;
              void run(() =>
                client.promoteQueuedInput({ sessionId, inputId: input.id, targetTurnId }),
              );
            },
          },
          {
            id: 'retry',
            label: t('chat.input.queue.retry'),
            disabled: isWorking || input.status !== 'interrupted',
            onPress: () =>
              void run(() => client.retryQueuedInput({ sessionId, inputId: input.id })),
          },
          {
            id: 'remove',
            label: t('chat.input.queue.remove'),
            destructive: true,
            disabled: isWorking || !canEdit,
            onPress: () =>
              void run(() => client.removeQueuedInput({ sessionId, inputId: input.id })),
          },
        ];
        return (
          <View key={input.id} className="gap-1">
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-foreground text-sm" numberOfLines={3}>
                  {input.parts
                    .map((part) => (part.type === 'text' ? part.text : part.name))
                    .join('\n')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {t(`chat.input.queue.status.${input.status}`)}
                </Text>
                {input.reason ? (
                  <Text className="text-muted-foreground text-xs">
                    {t(REASON_KEYS[input.reason])}
                  </Text>
                ) : null}
                {input.modelId ? (
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {parseUniqueModelId(input.modelId).modelId}
                  </Text>
                ) : null}
              </View>
              <ActionMenu items={items}>
                <Button
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t('chat.input.queue.actions')}
                >
                  <Button.Label>{t('chat.input.queue.actions')}</Button.Label>
                </Button>
              </ActionMenu>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function QueueEditor({
  input,
  disabled,
  onCancel,
  onSave,
}: {
  input: AgentSessionInput;
  disabled: boolean;
  onCancel: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(() =>
    input.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
  );
  const files = input.parts.filter((part) => part.type === 'file');
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-6 pb-6">
      <TextField disabled={disabled}>
        <TextField.Label>{t('chat.input.queue.edit')}</TextField.Label>
        <Input
          accessibilityLabel={t('chat.input.queue.edit')}
          multiline
          value={text}
          onChangeText={setText}
        />
      </TextField>
      {files.map((file) => (
        <Text key={file.fileEntryId} className="text-muted-foreground text-sm">
          {file.name}
        </Text>
      ))}
      <Button
        disabled={disabled || (!text.trim() && !files.length)}
        onPress={() => void onSave(text)}
      >
        <Button.Label>{t('chat.input.queue.save')}</Button.Label>
      </Button>
      <Button disabled={disabled} variant="ghost" onPress={onCancel}>
        <Button.Label>{t('chat.input.queue.back')}</Button.Label>
      </Button>
    </ScrollView>
  );
}
