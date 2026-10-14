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
import { useAgentApiById, useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { SkillAction } from '@/shared/data/types/skill';

const logger = loggerService.withContext('StartSkillChat');

/**
 * Open a fresh editable draft; preparing or installing starts only after the user sends.
 * Installation in chat belongs to standard Agents: a minimal current Agent has no such entry.
 */
export function useStartSkillChat() {
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const target = route.status === 'ready' ? route.target : undefined;
  const session = useAgentSession(target?.kind === 'session' ? target.sessionId : undefined);
  const currentAgentId = target?.kind === 'draft' ? target.agentId : session.data?.agentId;
  const currentAgent = useAgentApiById(currentAgentId).agent;
  // A session still loading has a current Agent whose mode is unknown, never a free choice.
  const isAvailable = target ? currentAgent?.mode === 'standard' : true;
  const agents = useAgentsApi();
  const { t } = useTranslation();
  const { toast } = useToast();
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  async function open(action: SkillAction = 'find-and-install') {
    if (opening.current || !isAvailable) return;
    opening.current = true;
    setIsOpening(true);
    try {
      const result = await agents.refetch();
      if (result.error) throw result.error;
      const available = (result.data?.items ?? agents.agents).filter(
        (agent) => agent.mode === 'standard',
      );
      // Without a current Agent, any standard Agent hosts the installation conversation.
      const agentId = target
        ? available.find((agent) => agent.id === currentAgentId)?.id
        : available[0]?.id;
      if (!agentId) {
        if (target) return;
        toast.show({ label: t('skills.chatRequiresStandardAgent'), variant: 'danger' });
        router.push('/agents');
        return;
      }
      const composerHandoff = createChatComposerHandoff({
        attachments: [],
        draft: '',
        skillAction: action,
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

  return { isAvailable, isOpening, open };
}
