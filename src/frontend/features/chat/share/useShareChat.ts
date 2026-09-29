import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { ConversationReadError } from '@/frontend/appShell/conversation';
import { useDocumentExport } from '@/frontend/appShell/documentExport';
import { conversationHref } from '@/frontend/appShell/navigation/chat';
import { DocumentExportError } from '@/shared/contracts/documentExport';

import type { ChatShareTarget } from './chatShareTarget';
import { ChatExportError, prepareChatExport } from './prepareChatExport';
import { toChatExportDocument, type ChatExportOptions } from './toChatExportDocument';

export function useShareChat(target: ChatShareTarget) {
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
  }, [target]);

  const shareChat = useCallback(
    (messageIds: readonly string[]) => {
      if (busy.current) return;
      busy.current = true;
      const controller = new AbortController();
      loading.current = controller;
      setIsSharing(true);
      void (async () => {
        try {
          const data = await prepareChatExport(target, messageIds, controller.signal);
          controller.signal.throwIfAborted();
          const { messages } = data;
          const options: ChatExportOptions = {
            title: data.title?.trim() || t('chat.share.documentTitle'),
            includeProcess: true,
            labels: {
              user: t('chat.share.user'),
              assistant: data.assistantName || t('chat.share.assistant'),
              process: (seconds) => t('chat.process.duration', { seconds }),
              sources: (count) => t('chat.sources.count', { count }),
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
            initialFormat: 'image',
            allowedFormats: ['image', 'html', 'markdown'],
            option: hasProcess
              ? {
                  label: t('chat.share.includeProcess'),
                  uncheckedInput: {
                    kind: 'document',
                    document: toChatExportDocument(messages, { ...options, includeProcess: false }),
                  },
                }
              : undefined,
            returnTo: conversationHref(target.ref),
          });
          if (outcome === 'busy' && mounted.current)
            toast.show({ label: t('documentExport.errors.busy'), variant: 'danger' });
        } catch (error) {
          if (mounted.current && !controller.signal.aborted) {
            const label =
              error instanceof ChatExportError
                ? t(`chat.share.errors.${error.code}`)
                : error instanceof ConversationReadError && error.failure.code === 'not-found'
                  ? t('chat.share.errors.missing')
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
    [open, target, t, toast],
  );
  const cancelShare = useCallback(() => loading.current?.abort(), []);
  return { shareChat, isSharing, cancelShare };
}
