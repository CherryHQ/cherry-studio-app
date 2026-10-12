import { useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  chatHref,
  createChatComposerHandoff,
  parseChatRoute,
  type ChatRouteParamsInput,
} from '@/frontend/appShell/navigation/chat';
import { useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('StartSkillChat');

/** Open a fresh editable draft; preparing or installing starts only after the user sends. */
export function useStartSkillChat() {
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const target = route.status === 'ready' ? route.target : undefined;
  const session = useAgentSession(target?.kind === 'session' ? target.sessionId : undefined);
  const agents = useAgentsApi();
  const { t } = useTranslation();
  const { toast } = useToast();
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  async function open() {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    try {
      const result = await agents.refetch();
      if (result.error) throw result.error;
      const available = result.data?.items ?? agents.agents;
      const currentSession =
        target?.kind === 'session' ? (session.data ?? (await session.refetch()).data) : undefined;
      const currentAgentId = target?.kind === 'draft' ? target.agentId : currentSession?.agentId;
      const agentId =
        available.find((agent) => agent.id === currentAgentId)?.id ?? available[0]?.id;
      if (!agentId) {
        router.push('/agents');
        return;
      }
      const composerHandoff = createChatComposerHandoff({
        attachments: [],
        draft: '',
        skillAction: 'find-and-install',
      });
      const href = chatHref({ agentId, composerHandoff, kind: 'draft' });
      if (router.canDismiss()) router.dismissTo(href);
      else router.replace(href);
    } catch (error) {
      logger.warn('Failed to open Skill conversation', error as Error);
      toast.show({ label: t('skills.loadFailed'), variant: 'danger' });
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  }

  return { isOpening, open };
}
