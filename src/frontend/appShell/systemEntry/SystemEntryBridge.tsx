import { useToast } from '@cherrystudio/ui/components';
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
import type { SystemAction, SystemSharedFile } from '@/shared/contracts';

import { createShareComposerHandoff } from './shareComposerHandoff';
import { useSystemEntryClaims } from './useSystemEntryClaims';

/** Hands an incoming system share to the chat composer, for the user to edit, retarget, and send. */
export function SystemEntryBridge() {
  const module = useBackendModule('systemEntry');
  const router = useRouter();
  const pathname = usePathname();
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

  const deliver = (action: SystemAction) => {
    // Without an Agent there is nowhere to put a share, so it waits for a later pass.
    if (!navigation?.key || !recentAgentId) return false;
    const composerHandoff = createShareComposerHandoff({
      attachments: action.files.map(toShareAttachment),
      draft: action.text,
    });
    const chatTarget = { agentId: recentAgentId, kind: 'draft', composerHandoff } as const;
    // Seed the chat in view, or come back to chat from wherever the app was left. Dismissing pops
    // to chat when it is in the stack and replaces the current page when it is not.
    if (pathname === '/') router.setParams(chatRouteParams(chatTarget));
    else router.dismissTo(chatHref(chatTarget));
    return true;
  };

  useSystemEntryClaims({
    deliver,
    isReady: Boolean(navigation?.key && recentAgentId),
    module,
    onFailure: () => toast.show({ label: t('systemEntry.failed'), variant: 'danger' }),
  });

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
