import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { ConversationReadError } from '@/frontend/appShell/conversation';
import { useBackendModule } from '@/frontend/data';
import { DocumentExportError, type DocumentExportSession } from '@/shared/contracts/documentExport';
import { APP_LANGUAGES } from '@/shared/utils/languages';

import type { ChatShareTarget } from './chatShareTarget';
import { ChatExportError, prepareChatExport } from './prepareChatExport';
import { toChatExportDocument, type ChatExportOptions } from './toChatExportDocument';

export type ChatShareContent = {
  session: DocumentExportSession;
  messageIds: readonly string[];
  withoutProcess?: DocumentExportSession;
};

function disposeContent(content: ChatShareContent | undefined) {
  if (content)
    void Promise.allSettled([content.session.dispose(), content.withoutProcess?.dispose()]);
}

export function useShareChat(target: ChatShareTarget) {
  const module = useBackendModule('documentExport');
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSharing, setIsSharing] = useState(false);
  const [content, setContent] = useState<ChatShareContent>();
  const [error, setError] = useState<string>();
  const currentContent = useRef<ChatShareContent | undefined>(undefined);
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
      disposeContent(currentContent.current);
      currentContent.current = undefined;
      subscription.remove();
    };
  }, [target]);

  const shareChat = useCallback(
    async (messageIds: readonly string[]): Promise<boolean> => {
      loading.current?.abort();
      const controller = new AbortController();
      loading.current = controller;
      setIsSharing(true);
      setError(undefined);
      try {
        const data = await prepareChatExport(target, messageIds, controller.signal);
        controller.signal.throwIfAborted();
        const { messages } = data;
        const options: ChatExportOptions = {
          title: data.title?.trim() || t('chat.share.documentTitle'),
          includeProcess: true,
          translations: target.ref.source.kind === 'local' ? target.translations : undefined,
          labels: {
            user: t('chat.share.user'),
            assistant: data.assistantName || t('chat.share.assistant'),
            process: (seconds) => t('chat.process.duration', { seconds }),
            sources: (count) => t('chat.sources.count', { count }),
            reasoning: t('chat.reasoningStatus.thought'),
            file: t('chat.share.file'),
            status: t('chat.share.status'),
            translation: (language) =>
              t('chat.translation.result', {
                language: APP_LANGUAGES.find(({ value }) => value === language)?.label,
              }),
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
        const labels = {
          code: t('documentExport.content.code'),
          codeOmitted: t('documentExport.content.codeOmitted'),
          file: t('documentExport.content.file'),
          fileMetadataOnly: t('documentExport.content.fileMetadataOnly'),
          image: t('documentExport.content.image'),
          imageUnavailable: t('documentExport.content.imageUnavailable'),
          sources: t('documentExport.content.sources'),
          table: t('documentExport.content.table'),
        };
        const session = module.createSession({
          kind: 'document',
          document: { ...document, labels },
        });
        let withoutProcess: DocumentExportSession | undefined;
        try {
          withoutProcess = hasProcess
            ? module.createSession({
                kind: 'document',
                document: {
                  ...toChatExportDocument(messages, { ...options, includeProcess: false }),
                  labels,
                },
              })
            : undefined;
        } catch (error) {
          void session.dispose();
          throw error;
        }
        const next = { session, withoutProcess, messageIds: messages.map((message) => message.id) };
        if (!mounted.current || controller.signal.aborted) {
          disposeContent(next);
          return false;
        }
        disposeContent(currentContent.current);
        currentContent.current = next;
        setContent(next);
        return true;
      } catch (error) {
        if (mounted.current && loading.current === controller && controller.signal.aborted) {
          if (!currentContent.current) setError(t('documentExport.paused'));
        } else if (mounted.current && !controller.signal.aborted) {
          const label =
            error instanceof ChatExportError
              ? t(`chat.share.errors.${error.code}`)
              : error instanceof ConversationReadError && error.failure.code === 'not-found'
                ? t('chat.share.errors.missing')
                : error instanceof DocumentExportError && error.code === 'size-limit'
                  ? t('chat.share.tooLarge')
                  : t('chat.share.loadFailed');
          if (currentContent.current) toast.show({ label, variant: 'danger' });
          else setError(label);
        }
        return false;
      } finally {
        if (loading.current === controller) {
          loading.current = undefined;
          if (mounted.current) setIsSharing(false);
        }
      }
    },
    [module, target, t, toast],
  );
  const cancelShare = useCallback(() => loading.current?.abort(), []);
  return { shareChat, isSharing, cancelShare, content, error };
}
