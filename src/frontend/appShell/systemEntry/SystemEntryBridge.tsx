import { useToast } from '@cherrystudio/ui/components';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { chatHref, createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import {
  type ComposerInitialAttachment,
  isComposerImageMediaType,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { useBackendModule } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';
import type { SystemAction, SystemSharedFile } from '@/shared/contracts';

import { useSystemEntryClaims } from './useSystemEntryClaims';

type ShareDestination = { kind: 'draft'; agentId: string } | { kind: 'session'; sessionId: string };

const SystemShareContext = createContext<{
  isPending: boolean;
  cancel(): void;
  select(destination: ShareDestination): void;
} | null>(null);

export function useSystemShareDestination() {
  const context = use(SystemShareContext);
  if (!context) throw new Error('SystemEntryBridge is required');
  return context;
}

/** Owns the unsent share while a separate route chooses its destination. */
export function SystemEntryBridge({ children }: PropsWithChildren) {
  const module = useBackendModule('systemEntry');
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { agents } = useAgentsApi();
  const [pendingAction, setPendingAction] = useState<SystemAction>();
  // The phase prevents same-pass deliveries and double taps before React commits state.
  const phase = useRef<'idle' | 'choosing' | 'leaving'>('idle');
  const hasEnteredDestination = useRef(false);
  const isDestination = pathname === '/share-destination';

  useEffect(() => {
    if (isDestination) {
      hasEnteredDestination.current = true;
    } else if (hasEnteredDestination.current) {
      hasEnteredDestination.current = false;
      phase.current = 'idle';
      setPendingAction(undefined);
    }
  }, [isDestination]);

  const deliver = (action: SystemAction) => {
    if (!navigation?.key || !agents.length || phase.current !== 'idle' || isDestination)
      return false;
    phase.current = 'choosing';
    setPendingAction(action);
    router.push('/share-destination');
    return true;
  };

  const select = useCallback(
    (destination: ShareDestination) => {
      if (!pendingAction || phase.current !== 'choosing') return;
      phase.current = 'leaving';
      const composerHandoff = createChatComposerHandoff({
        attachments: pendingAction.files.map(toShareAttachment),
        draft: pendingAction.text,
      });
      router.dismissTo(chatHref({ ...destination, composerHandoff }));
    },
    [pendingAction, router],
  );

  const cancel = useCallback(() => {
    if (phase.current !== 'choosing') return;
    phase.current = 'leaving';
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  const context = useMemo(
    () => ({ isPending: Boolean(pendingAction), select, cancel }),
    [pendingAction, select, cancel],
  );

  useSystemEntryClaims({
    deliver,
    isReady: Boolean(navigation?.key && agents.length && !pendingAction && !isDestination),
    module,
    onFailure: () => toast.show({ label: t('systemEntry.failed'), variant: 'danger' }),
  });

  return <SystemShareContext value={context}>{children}</SystemShareContext>;
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
