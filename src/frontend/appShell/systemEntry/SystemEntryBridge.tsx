import { useToast } from '@cherrystudio/ui/components';
import { useGlobalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import {
  type ChatRouteParamsInput,
  chatHref,
  chatRouteParams,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import {
  type ComposerInitialAttachment,
  isComposerImageMediaType,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { useBackendModule } from '@/frontend/data';
import { useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';
import type { SystemSharedFile } from '@/shared/contracts';

import { createShareComposerHandoff } from './shareComposerHandoff';

/** Hands an incoming system share to the chat composer, for the user to edit, retarget, and send. */
export function SystemEntryBridge() {
  const module = useBackendModule('systemEntry');
  const router = useRouter();
  const navigation = useRootNavigationState();
  const { t } = useTranslation();
  const { toast } = useToast();
  // The Agent a share opens under is the one a new chat would use: the Agent in view, then the
  // first available one.
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);
  const target = route.status === 'ready' ? route.target : undefined;
  const openSession = useAgentSession(target?.kind === 'session' ? target.sessionId : undefined);
  const { agents } = useAgentsApi();
  const recentAgentId =
    (target?.kind === 'draft' ? target.agentId : openSession.data?.agentId) ?? agents[0]?.id;
  // A claim survives one navigation and outlives the effect that started it.
  const claiming = useRef(false);

  useEffect(() => {
    // Without an Agent there is nowhere to put a share, so it stays staged for a later pass.
    if (!navigation?.key || !recentAgentId) return;
    let stopped = false;

    const claim = async () => {
      if (stopped || claiming.current || AppState.currentState !== 'active') return;
      claiming.current = true;
      try {
        const action = await module.claimNext();
        if (!action || stopped) return;
        const composerHandoff = createShareComposerHandoff({
          attachments: action.files.map(toShareAttachment),
          draft: action.text,
        });
        const chatTarget = { agentId: recentAgentId, kind: 'draft', composerHandoff } as const;
        // Come back to chat from wherever the app was left, then seed its composer.
        if (router.canDismiss()) router.dismissTo(chatHref(chatTarget));
        else router.setParams(chatRouteParams(chatTarget));
      } catch {
        if (!stopped) toast.show({ label: t('systemEntry.failed'), variant: 'danger' });
      } finally {
        claiming.current = false;
      }
    };

    const stopPending = module.subscribePending(() => void claim());
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void claim();
    });
    void claim();

    return () => {
      stopped = true;
      stopPending();
      foreground.remove();
    };
  }, [module, navigation?.key, recentAgentId, router, t, toast]);

  return null;
}

function toShareAttachment(file: SystemSharedFile): ComposerInitialAttachment {
  return {
    fileEntryId: file.fileEntryId,
    id: `file-entry:${file.fileEntryId}`,
    kind: isComposerImageMediaType(file.mediaType) ? 'image' : 'file',
    mediaType: file.mediaType,
    name: file.name,
    size: file.size,
    status: 'ready',
    uri: file.uri,
  };
}
