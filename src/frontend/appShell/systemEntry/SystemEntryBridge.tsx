import { useToast } from '@cherrystudio/ui/components';
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import {
  type ChatRouteParamsInput,
  chatHref,
  createChatComposerHandoff,
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

import { type ShareDestination, ShareDestinationSheet } from './ShareDestinationSheet';
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
  const [pendingAction, setPendingAction] = useState<SystemAction>();
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  // A ready pass can deliver several held actions before React renders the first one.
  const pendingActionRef = useRef<SystemAction | undefined>(undefined);
  const isReady = Boolean(navigation?.key && recentAgentId);

  const deliver = (action: SystemAction) => {
    // Without an Agent there is nowhere to put a share, so it waits for a later pass.
    if (!navigation?.key || !recentAgentId) return false;
    if (pendingActionRef.current) {
      setIsDestinationOpen(true);
      return false;
    }
    pendingActionRef.current = action;
    setPendingAction(action);
    setIsDestinationOpen(true);
    return true;
  };

  const onSelect = (destination: ShareDestination) => {
    const action = pendingActionRef.current;
    if (!action) return;
    const composerHandoff = createChatComposerHandoff({
      attachments: action.files.map(toShareAttachment),
      draft: action.text,
    });
    const chatTarget = { ...destination, composerHandoff };
    // Seed the chat in view, or come back to chat from wherever the app was left. Dismissing pops
    // to chat when it is in the stack and replaces the current page when it is not.
    if (pathname === '/') router.setParams(chatRouteParams(chatTarget));
    else router.dismissTo(chatHref(chatTarget));
    pendingActionRef.current = undefined;
    setPendingAction(undefined);
    setIsDestinationOpen(false);
  };

  useSystemEntryClaims({
    deliver,
    isReady: isReady && !pendingAction,
    module,
    onFailure: () => toast.show({ label: t('systemEntry.failed'), variant: 'danger' }),
  });

  useEffect(() => {
    if (!isReady || !pendingAction) return;
    // A cancelled share stays here. A new share or foreground entry retries selection;
    // native staging and the claims hook keep subsequent shares queued until it is selected.
    const reopen = () => {
      if (pendingActionRef.current) setIsDestinationOpen(true);
    };
    const stopPending = module.subscribePending(reopen);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') reopen();
    });
    return () => {
      stopPending();
      foreground.remove();
    };
  }, [isReady, module, pendingAction]);

  return (
    <ShareDestinationSheet
      defaultAgentId={recentAgentId}
      onCancel={() => setIsDestinationOpen(false)}
      onSelect={onSelect}
      open={isDestinationOpen}
    />
  );
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
