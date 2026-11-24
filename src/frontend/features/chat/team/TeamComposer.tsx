import { Button, useAlert, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  startTeamSessionAndSend,
  useTeamComposerDraft,
} from '@/frontend/appShell/conversation/team';
import {
  ComposerSurface,
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer';
import {
  TeamAgentError,
  type TeamAgent,
  type TeamAgentModule,
  type TeamConversation,
  type TeamConversationState,
  type TeamSession,
} from '@/shared/contracts/teamAgent';

import { ChatInputSurface } from '../components/ChatInput';

export function TeamComposer({
  module,
  contextKey,
  draftKey,
  conversation,
  state,
  agent,
  onSessionCreated,
}: {
  module: TeamAgentModule;
  contextKey: string;
  draftKey: string;
  conversation?: TeamConversation;
  state: TeamConversationState;
  agent?: TeamAgent;
  onSessionCreated(session: TeamSession): void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { draft } = useComposerState();
  const { setDraft } = useComposerActions();
  const lifetime = useTeamComposerDraft({
    module,
    draftKey,
    draft,
    setDraft,
    accepted: state.accepted,
  });
  const tooLong = agent?.maxInputLength !== undefined && draft.length > agent.maxInputLength;
  const ready = conversation
    ? state.phase === 'current' && Boolean(state.view?.canSend) && !state.submitting && !tooLong
    : Boolean(agent?.canCreateSession) && !tooLong;
  const resend = () =>
    alert.confirm({
      title: t('teamAgent.unknownTitle'),
      description: t('teamAgent.unknownDescription'),
      confirmLabel: t('teamAgent.sendAgain'),
      onConfirm: () => {
        if (!conversation || !ready || !draft.trim()) return;
        const input = draft;
        void conversation
          .send(input, true)
          .then((result) => {
            if (!lifetime.current) return;
            if (result === 'accepted') setDraft((current) => (current === input ? '' : current));
            else if (result === 'rejected')
              toast.show({ label: t('remoteAgent.sendFailed'), variant: 'danger' });
          })
          .catch(() => {
            if (lifetime.current)
              toast.show({ label: t('teamAgent.unavailable'), variant: 'danger' });
          });
      },
    });
  return (
    <View>
      {state.unknown ? (
        <View className="gap-2 px-4 py-2">
          <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
            {t('teamAgent.unknownTitle')}
          </Text>
          <Text className="text-sm text-muted-foreground">{t('teamAgent.unknownDescription')}</Text>
          <Button disabled={!ready || !draft.trim()} onPress={resend} size="sm" variant="secondary">
            {t('teamAgent.sendAgain')}
          </Button>
        </View>
      ) : null}
      {tooLong ? (
        <Text className="px-4 text-sm text-danger">
          {t('teamAgent.textLimit', { count: agent!.maxInputLength })}
        </Text>
      ) : null}
      <ComposerSurface
        sendPolicy="confirmed"
        canSend={Boolean(ready && !state.unknown && draft.trim())}
        streaming={Boolean(conversation && state.phase === 'current' && state.view?.canStop)}
        getSendErrorLabel={(error) =>
          error instanceof TeamAgentError && error.code === 'busy'
            ? t('teamAgent.unknownTitle')
            : t('remoteAgent.sendFailed')
        }
        onSend={async ({ text }) => {
          if (conversation) {
            try {
              const result = await conversation.send(text);
              if (!lifetime.current) throw new DOMException('Observation ended', 'AbortError');
              if (result !== 'accepted')
                throw new TeamAgentError(result === 'unknown' ? 'busy' : 'unavailable');
            } catch (error) {
              if (!lifetime.current) throw new DOMException('Observation ended', 'AbortError');
              throw error;
            }
            return;
          }
          if (!agent?.canCreateSession) throw new TeamAgentError('unavailable');
          try {
            const { status } = await startTeamSessionAndSend({
              module,
              contextKey,
              agentId: agent.id,
              text,
              draftKey,
              onSessionCreated,
            });
            if (status === 'accepted') return;
            if (!lifetime.current) throw new DOMException('Observation ended', 'AbortError');
            throw new TeamAgentError(status === 'unknown' ? 'busy' : 'unavailable');
          } catch (error) {
            if (!lifetime.current) throw new DOMException('Observation ended', 'AbortError');
            throw error;
          }
        }}
        onStop={() =>
          void conversation?.stop().catch(() => {
            if (lifetime.current)
              toast.show({ label: t('teamAgent.unavailable'), variant: 'danger' });
          })
        }
      >
        <ChatInputSurface
          attachmentMode="text-only"
          streaming={Boolean(conversation && state.view?.canStop)}
        />
      </ComposerSurface>
    </View>
  );
}
