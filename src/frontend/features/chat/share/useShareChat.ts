import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useDocumentExport } from '@/frontend/appShell/documentExport';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { DocumentExportError } from '@/shared/contracts/documentExport';
import type { ListAgentSessionMessagesQueryParams } from '@/shared/data/api/schemas/agentSessionMessages';

import { ChatExportError, loadChatExportMessages } from './loadChatExportMessages';
import { toChatExportDocument, type ChatExportOptions } from './toChatExportDocument';

export function useShareChat(sessionId?: string) {
  const api = useApiClient();
  const { open } = useDocumentExport();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSharing, setIsSharing] = useState(false);
  const busy = useRef(false);
  const loading = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') loading.current?.abort();
    });
    return () => {
      mounted.current = false;
      loading.current?.abort();
      subscription.remove();
    };
  }, [sessionId]);

  const shareChat = useCallback(
    (messageIds: readonly string[]) => {
      if (!sessionId || busy.current) return;
      busy.current = true;
      const controller = new AbortController();
      loading.current = controller;
      setIsSharing(true);
      void (async () => {
        try {
          const readPage = (query: ListAgentSessionMessagesQueryParams) =>
            api.get(`/agent-sessions/${sessionId}/messages`, {
              query,
              signal: controller.signal,
            });
          const [messages, sourceSession] = await Promise.all([
            loadChatExportMessages(messageIds, readPage, controller.signal),
            api.get(`/agent-sessions/${sessionId}`, { signal: controller.signal }),
          ]);
          controller.signal.throwIfAborted();
          const agent = await api.get(`/agents/${sourceSession.agentId}`, {
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          const options: ChatExportOptions = {
            title: sourceSession.title.trim() || t('chat.share.documentTitle'),
            includeProcess: true,
            labels: {
              user: t('chat.share.user'),
              assistant: agent.name || t('chat.share.assistant'),
              process: (seconds) => t('chat.process.duration', { seconds }),
              reasoning: t('chat.reasoningStatus.thought'),
              file: t('chat.share.file'),
              status: t('chat.share.status'),
              messageStatuses: {
                pending: t('chat.share.unsettled'),
                streaming: t('chat.share.unsettled'),
                success: t('chat.share.completed'),
                error: t('chat.share.error'),
                cancelled: t('chat.share.cancelled'),
                interrupted: t('chat.share.interrupted'),
              },
            },
          };
          const document = toChatExportDocument(messages, options);
          const hasProcess = document.sections.some((section) =>
            section.blocks.some((block) => block.kind === 'details'),
          );
          // The exporter owns both immutable snapshots from here; chat only supplies their label.
          loading.current = undefined;
          const outcome = await open({
            input: { kind: 'document', document },
            option: hasProcess
              ? {
                  label: t('chat.share.includeProcess'),
                  uncheckedInput: {
                    kind: 'document',
                    document: toChatExportDocument(messages, { ...options, includeProcess: false }),
                  },
                }
              : undefined,
          });
          if (outcome === 'busy' && mounted.current)
            toast.show({ label: t('documentExport.errors.busy'), variant: 'danger' });
        } catch (error) {
          if (mounted.current && !controller.signal.aborted) {
            const label =
              error instanceof ChatExportError
                ? t(`chat.share.errors.${error.code}`)
                : error instanceof DocumentExportError && error.code === 'size-limit'
                  ? t('chat.share.tooLarge')
                  : t('chat.share.loadFailed');
            toast.show({ label, variant: 'danger' });
          }
          controller.abort();
        } finally {
          if (loading.current === controller) loading.current = undefined;
          busy.current = false;
          if (mounted.current) setIsSharing(false);
        }
      })();
    },
    [api, open, sessionId, t, toast],
  );
  const cancelShare = useCallback(() => loading.current?.abort(), []);
  return { shareChat, isSharing, cancelShare };
}
