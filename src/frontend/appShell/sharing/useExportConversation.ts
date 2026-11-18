import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { readableFilename } from '@/shared/data/types/file';

import { type ConversationRef, useConversationSource } from '../conversation';
import { shareTextFile } from '../fileExport';
import { conversationToMarkdown, ConversationExportError } from './conversationMarkdown';

export function useExportConversation(ref: ConversationRef) {
  const source = useConversationSource();
  const readTranscript = ref.source.kind === 'local' ? source.catalog.readTranscript : undefined;
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, [source, ref.sessionId]);
  const exportConversation = useCallback(async () => {
    if (pending.current || !readTranscript) return;
    const controller = new AbortController();
    pending.current = controller;
    setIsExporting(true);
    try {
      await shareTextFile(async () => {
        const snapshot = await readTranscript(ref, controller.signal);
        controller.signal.throwIfAborted();
        const title = snapshot.title?.trim() || t('chat.share.documentTitle');
        return {
          filename: readableFilename(title, { extension: 'md', fallback: 'conversation' }),
          mediaType: 'text/markdown',
          text: conversationToMarkdown(snapshot, {
            title,
            user: t('chat.share.user'),
            assistant: t('chat.share.assistant'),
            reasoning: t('session.export.reasoning'),
            response: t('session.export.response'),
            file: t('chat.share.file'),
            sources: t('documentExport.content.sources'),
            status: t('chat.share.status'),
            messageStatuses: {
              pending: t('chat.share.unsettled'),
              streaming: t('chat.share.unsettled'),
              success: t('chat.share.completed'),
              error: t('chat.share.error'),
              cancelled: t('chat.share.cancelled'),
              interrupted: t('chat.share.interrupted'),
            },
          }),
        };
      }, controller.signal);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        toast.show({
          label:
            error instanceof ConversationExportError
              ? error.code === 'empty'
                ? t('session.export.empty')
                : t('session.export.unsettled')
              : t('session.export.failed'),
          variant: 'danger',
        });
    } finally {
      if (pending.current === controller) pending.current = undefined;
      if (mounted.current) setIsExporting(false);
    }
  }, [readTranscript, ref, t, toast]);
  return { exportConversation, isExporting, canExport: Boolean(readTranscript) };
}
