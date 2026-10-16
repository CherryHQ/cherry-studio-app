import { ActionMenu, Button, useToast } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { createContext, use, useCallback, useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { conversationHref } from '@/frontend/appShell/navigation/chat';
import { ModelPickerDrawer } from '@/frontend/components/ModelPicker';
import type { AgentConversationState } from '@/shared/contracts/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

import { useAgentChatClient } from '../../runtime';

type Source = { messageId: string; candidateId?: string };
type MultiModelChatState = {
  nextModelIds: readonly UniqueModelId[];
  isBusy: boolean;
  awaitingAdoption: boolean;
  paths?: AgentConversationState;
};
type MultiModelChatActions = {
  chooseModels(initial: readonly UniqueModelId[], source?: Source): void;
  clearModels(): void;
  adopt(messageId: string, candidateId: string): Promise<void>;
  restore(pathId: string): Promise<void>;
  fork(source: Source): Promise<void>;
  stop(messageId: string, candidateId: string): Promise<void>;
};
const State = createContext<MultiModelChatState | null>(null);
const Actions = createContext<MultiModelChatActions | null>(null);

export function MultiModelChatProvider({
  children,
  sessionId,
  isBusy,
  awaitingAdoption = false,
  paths,
}: PropsWithChildren<{
  sessionId?: string;
  isBusy: boolean;
  awaitingAdoption?: boolean;
  paths?: AgentConversationState;
}>) {
  const { client } = useAgentChatClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [nextModelIds, setNextModelIds] = useState<readonly UniqueModelId[]>([]);
  const [picker, setPicker] = useState<{ ids: UniqueModelId[]; source?: Source }>();
  const [isApplying, setIsApplying] = useState(false);
  const chooseModels = useCallback((ids: readonly UniqueModelId[], source?: Source) => {
    setPicker({ ids: [...ids], source });
  }, []);
  const clearModels = useCallback(() => setNextModelIds([]), []);
  const adopt = useCallback(
    async (messageId: string, candidateId: string) => {
      if (!sessionId) return;
      setIsApplying(true);
      try {
        await client.selectAnswer({ sessionId, messageId, candidateId });
        setNextModelIds([]);
      } finally {
        setIsApplying(false);
      }
    },
    [client, sessionId],
  );
  const restore = useCallback(
    async (pathId: string) => {
      if (!sessionId) return;
      setIsApplying(true);
      try {
        await client.restoreConversationPath({ sessionId, pathId });
        setNextModelIds([]);
      } finally {
        setIsApplying(false);
      }
    },
    [client, sessionId],
  );
  const fork = useCallback(
    async (source: Source) => {
      if (!sessionId) return;
      const session = await client.forkSession(
        sessionId,
        source.messageId,
        undefined,
        source.candidateId,
      );
      router.replace(conversationHref({ source: { kind: 'local' }, sessionId: session.id }));
    },
    [client, sessionId],
  );
  const stop = useCallback(
    async (messageId: string, candidateId: string) => {
      if (sessionId) await client.cancelCandidate({ sessionId, messageId, candidateId });
    },
    [client, sessionId],
  );
  const actions = useMemo(
    () => ({ chooseModels, clearModels, adopt, restore, fork, stop }),
    [chooseModels, clearModels, adopt, restore, fork, stop],
  );
  const state = useMemo(
    () => ({ nextModelIds, isBusy: isBusy || isApplying, awaitingAdoption, paths }),
    [nextModelIds, isBusy, isApplying, awaitingAdoption, paths],
  );
  async function confirm() {
    if (!picker?.ids.length || isBusy || isApplying) return;
    setIsApplying(true);
    try {
      if (picker.source && sessionId)
        await client.prepareContinuation({ sessionId, ...picker.source });
      setNextModelIds(picker.ids);
      setPicker(undefined);
    } catch {
      toast.show({ label: t('chat.multiModel.actionFailed'), variant: 'danger' });
    } finally {
      setIsApplying(false);
    }
  }
  return (
    <State value={state}>
      <Actions value={actions}>
        {children}
        {picker ? (
          <ModelPickerDrawer
            modelType="text"
            open
            title={t('chat.multiModel.chooseModels')}
            onClose={() => {
              if (!isApplying) setPicker(undefined);
            }}
            selectedModelId={picker.ids[0] ?? null}
            selectedModelIds={picker.ids}
            onSelect={(item) =>
              setPicker((current) =>
                current
                  ? {
                      ...current,
                      ids: current.ids.includes(item.modelId)
                        ? current.ids.filter((id) => id !== item.modelId)
                        : [...current.ids, item.modelId],
                    }
                  : current,
              )
            }
            variant="chat"
          >
            <View className="gap-2 px-5 pb-4 pt-2">
              <Text className="text-sm text-muted-foreground">
                {t('chat.multiModel.selectedModels', { count: picker.ids.length })}
              </Text>
              <Button
                disabled={!picker.ids.length || isBusy}
                loading={isApplying}
                onPress={() => void confirm()}
              >
                {t('common.done')}
              </Button>
            </View>
          </ModelPickerDrawer>
        ) : null}
      </Actions>
    </State>
  );
}

export function useMultiModelChatState() {
  return use(State);
}
export function useMultiModelChatActions() {
  return use(Actions);
}

/** Each answer owns its @ menu and can revisit every continuation created from it. */
export function ReplyContinuationMenu({
  messageId,
  candidateId,
  modelId,
  sourcePathId = 'root',
}: Source & { modelId?: UniqueModelId; sourcePathId?: string }) {
  const state = useMultiModelChatState();
  const actions = useMultiModelChatActions();
  const { t } = useTranslation();
  const { toast } = useToast();
  if (!state || !actions) return null;
  const source = { messageId, ...(candidateId ? { candidateId } : {}) };
  const continuations =
    state.paths?.paths.filter(
      (path) =>
        (path.sourceMessageId === messageId && path.candidateId === (candidateId ?? null)) ||
        (candidateId !== undefined && path.adopted[messageId] === candidateId) ||
        (candidateId === undefined && path.id === sourcePathId),
    ) ?? [];
  return (
    <ActionMenu
      items={[
        {
          id: 'models',
          label: t('chat.multiModel.newContinuation'),
          onPress: () => actions.chooseModels(modelId ? [modelId] : [], source),
        },
        {
          id: 'fork',
          label: t('chat.messageActions.fork'),
          onPress: () => {
            void actions
              .fork(source)
              .catch(() =>
                toast.show({ label: t('chat.multiModel.actionFailed'), variant: 'danger' }),
              );
          },
        },
        ...continuations.map((path, index) => ({
          id: path.id,
          label:
            path.id === sourcePathId
              ? t('chat.multiModel.originalContinuation')
              : t('chat.multiModel.continuation', { number: index + 1 }),
          checked: path.id === state.paths?.activePathId,
          onPress: () => {
            void actions
              .restore(path.id)
              .catch(() =>
                toast.show({ label: t('chat.multiModel.actionFailed'), variant: 'danger' }),
              );
          },
        })),
      ]}
    >
      <Button
        accessibilityLabel={t('chat.multiModel.newContinuation')}
        disabled={state.isBusy}
        size="xs"
        variant="ghost"
      >
        @
      </Button>
    </ActionMenu>
  );
}
