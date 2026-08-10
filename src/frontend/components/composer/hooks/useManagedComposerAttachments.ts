import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAlert } from '@/frontend/components/AlertProvider';
import { useBackendModule } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ComposerAttachmentStore } from '../context/ComposerProvider';
import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  type ComposerAttachmentReady,
  type ComposerAttachmentSource,
  type ComposerInitialAttachment,
  isComposerAttachmentReady,
  removeComposerAttachment,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('useManagedComposerAttachments');
const emptyInitialAttachments: readonly ComposerInitialAttachment[] = [];

type ImportResult = 'failed' | 'ignored' | 'ready';

export function useManagedComposerAttachments(
  initialAttachments: readonly ComposerInitialAttachment[] = emptyInitialAttachments,
): ComposerAttachmentStore {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const file = useBackendModule('file');
  const initialAttachmentsRef = useRef(initialAttachments);
  const didImportInitialAttachmentsRef = useRef(false);
  const isMountedRef = useRef(true);
  const importTokensRef = useRef(new Map<string, symbol>());
  const cancelledImportTokensRef = useRef(new Set<symbol>());
  const [attachments, setAttachmentState] = useState<ComposerAttachmentDraft[]>(() =>
    initialAttachments.map((attachment) =>
      isComposerAttachmentReady(attachment)
        ? attachment
        : { ...attachment, status: 'importing' as const },
    ),
  );
  const attachmentsRef = useRef(attachments);

  const commitAttachments = useCallback((nextAttachments: ComposerAttachmentDraft[]) => {
    attachmentsRef.current = nextAttachments;
    setAttachmentState(nextAttachments);
  }, []);

  const deleteEntry = useCallback(
    async (entryId: ComposerAttachmentReady['fileEntryId']) => {
      try {
        await file.deleteIfUnreferenced(entryId);
      } catch (error) {
        logger.warn('Failed to delete an unreferenced attachment', toError(error), { entryId });
      }
    },
    [file],
  );

  const importAttachment = useCallback(
    async (source: ComposerAttachmentSource, token: symbol): Promise<ImportResult> => {
      try {
        const resolved = await file.createInternalEntry({
          name: source.name,
          uri: source.uri,
        });

        if (cancelledImportTokensRef.current.delete(token)) {
          await deleteEntry(resolved.entry.id);
          return 'ignored';
        }
        if (!isMountedRef.current) {
          return 'ignored';
        }
        if (importTokensRef.current.get(source.id) !== token) {
          await deleteEntry(resolved.entry.id);
          return 'ignored';
        }

        importTokensRef.current.delete(source.id);
        commitAttachments(
          attachmentsRef.current.map((attachment) =>
            attachment.id === source.id && attachment.status === 'importing'
              ? {
                  ...source,
                  fileEntryId: resolved.entry.id,
                  size: resolved.entry.origin === 'internal' ? resolved.entry.size : source.size,
                  status: 'ready' as const,
                  uri: resolved.uri,
                }
              : attachment,
          ),
        );
        return 'ready';
      } catch (error) {
        if (cancelledImportTokensRef.current.delete(token)) {
          return 'ignored';
        }
        if (importTokensRef.current.get(source.id) !== token || !isMountedRef.current) {
          return 'ignored';
        }

        importTokensRef.current.delete(source.id);
        commitAttachments(removeComposerAttachment(attachmentsRef.current, source.id));
        logger.warn('Failed to import an attachment', toError(error), {
          name: source.name,
          uri: source.uri,
        });
        return 'failed';
      }
    },
    [commitAttachments, deleteEntry, file],
  );

  const importAttachments = useCallback(
    async (sources: readonly ComposerAttachmentSource[]) => {
      const pending = sources.map((source) => {
        const token = Symbol(source.id);
        importTokensRef.current.set(source.id, token);
        return importAttachment(source, token);
      });
      const results = await Promise.all(pending);
      const failureCount = results.filter((result) => result === 'failed').length;

      if (isMountedRef.current && failureCount > 0) {
        alert.show({
          title: t('chat.attachments.importFailed', { count: failureCount }),
        });
      }
    },
    [alert, importAttachment, t],
  );

  const addAttachments = useCallback(
    (nextAttachments: ComposerAttachmentDraft[]) => {
      const seenIds = new Set(attachmentsRef.current.map((attachment) => attachment.id));
      const accepted = nextAttachments.filter((attachment) => {
        if (seenIds.has(attachment.id)) return false;
        seenIds.add(attachment.id);
        return true;
      });
      const sources = accepted.filter(
        (attachment): attachment is ComposerAttachmentSource => attachment.status === undefined,
      );
      const staged = accepted.map(
        (attachment): ComposerAttachmentDraft =>
          isComposerAttachmentReady(attachment)
            ? attachment
            : { ...attachment, status: 'importing' },
      );

      if (staged.length === 0) return;
      commitAttachments(appendComposerAttachments(attachmentsRef.current, staged));
      if (sources.length > 0) void importAttachments(sources);
    },
    [commitAttachments, importAttachments],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      const attachment = attachmentsRef.current.find((item) => item.id === attachmentId);
      if (!attachment) return;

      const importToken = importTokensRef.current.get(attachmentId);
      if (importToken) {
        importTokensRef.current.delete(attachmentId);
        cancelledImportTokensRef.current.add(importToken);
      }
      commitAttachments(removeComposerAttachment(attachmentsRef.current, attachmentId));
      if (isComposerAttachmentReady(attachment)) void deleteEntry(attachment.fileEntryId);
    },
    [commitAttachments, deleteEntry],
  );

  const clearAttachments = useCallback(() => {
    importTokensRef.current.clear();
    commitAttachments([]);
  }, [commitAttachments]);

  const setAttachments = useCallback(
    (nextAttachments: ComposerAttachmentDraft[]) => {
      importTokensRef.current.clear();
      commitAttachments([...nextAttachments]);
    },
    [commitAttachments],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!didImportInitialAttachmentsRef.current) {
      didImportInitialAttachmentsRef.current = true;
      const sources = initialAttachmentsRef.current.filter(
        (attachment): attachment is ComposerAttachmentSource =>
          !isComposerAttachmentReady(attachment),
      );
      if (sources.length > 0) void importAttachments(sources);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [importAttachments]);

  return useMemo(
    () => ({
      addAttachments,
      attachments,
      clearAttachments,
      removeAttachment,
      setAttachments,
    }),
    [addAttachments, attachments, clearAttachments, removeAttachment, setAttachments],
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
