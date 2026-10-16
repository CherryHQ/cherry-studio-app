import {
  BackgroundPressExclusion,
  ContextMenuExclusion,
  Button,
  useToast,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';

import { useAssistantMessageActions } from '../ChatWorkspace/context/AssistantMessageActionsProvider';
import {
  ReplyContinuationMenu,
  useMultiModelChatActions,
  useMultiModelChatState,
} from './MultiModelChatProvider';

export function MultiModelReply({ message }: { message: MessageListItem }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useMultiModelChatActions();
  const state = useMultiModelChatState();
  const { copyAssistantMessage } = useAssistantMessageActions();
  const [isApplying, setIsApplying] = useState(false);
  const group = message.multiModel;
  if (!group) return null;
  return (
    <ContextMenuExclusion className="gap-5">
      {group.result.candidates.map((candidate) => (
        <View key={candidate.id} className="gap-2 border-l-2 border-border pl-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-semibold text-foreground text-sm">{candidate.name}</Text>
            <Text className="text-xs text-muted-foreground">
              {t(STATUS_KEYS[candidate.status])}
            </Text>
          </View>
          {candidate.reasoning ? (
            <Text className="text-sm text-muted-foreground" selectable>
              {candidate.reasoning}
            </Text>
          ) : null}
          {candidate.text ? (
            <MarkdownText markdown={candidate.text} isStreaming={candidate.status === 'running'} />
          ) : null}
          {candidate.error ? (
            <Text className="text-sm text-destructive">{t('chat.multiModel.candidateFailed')}</Text>
          ) : null}
          <BackgroundPressExclusion>
            <View className="flex-row flex-wrap items-center gap-1">
              {(candidate.status === 'running' || candidate.status === 'queued') && actions ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onPress={() => {
                    void actions
                      .stop(message.id, candidate.id)
                      .catch(() =>
                        toast.show({ label: t('chat.multiModel.actionFailed'), variant: 'danger' }),
                      );
                  }}
                >
                  {t('chat.multiModel.stop')}
                </Button>
              ) : null}
              {candidate.status === 'completed' && actions ? (
                <>
                  <Button
                    disabled={state?.isBusy || isApplying}
                    size="xs"
                    variant={group.selectedCandidateId === candidate.id ? 'secondary' : 'ghost'}
                    onPress={() => {
                      setIsApplying(true);
                      void actions
                        .adopt(message.id, candidate.id)
                        .catch(() =>
                          toast.show({
                            label: t('chat.multiModel.actionFailed'),
                            variant: 'danger',
                          }),
                        )
                        .finally(() => setIsApplying(false));
                    }}
                  >
                    {t(
                      group.selectedCandidateId === candidate.id
                        ? 'chat.multiModel.adopted'
                        : 'chat.multiModel.adopt',
                    )}
                  </Button>
                  <ReplyContinuationMenu
                    messageId={message.id}
                    candidateId={candidate.id}
                    modelId={candidate.modelId}
                    sourcePathId={message.pathId}
                  />
                </>
              ) : null}
              {candidate.text ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onPress={() =>
                    copyAssistantMessage({
                      messageId: `${message.id}:${candidate.id}`,
                      text: candidate.text,
                    })
                  }
                >
                  {t('common.copy')}
                </Button>
              ) : null}
            </View>
          </BackgroundPressExclusion>
        </View>
      ))}
      {!group.selectedCandidateId ? (
        <Text className="text-xs text-muted-foreground">{t('chat.multiModel.adoptHint')}</Text>
      ) : null}
    </ContextMenuExclusion>
  );
}

const STATUS_KEYS = {
  queued: 'chat.multiModel.status.queued',
  running: 'chat.multiModel.status.running',
  completed: 'chat.multiModel.status.completed',
  failed: 'chat.multiModel.status.failed',
  cancelled: 'chat.multiModel.status.cancelled',
  interrupted: 'chat.multiModel.status.interrupted',
} as const;
