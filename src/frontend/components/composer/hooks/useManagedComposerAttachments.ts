import { useAlert } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ComposerAttachmentStore } from '../context/ComposerProvider';
import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  type ComposerAttachmentReady,
  type ComposerAttachmentSource,
  type ComposerInitialAttachment,
  isComposerAttachmentSupported,
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
  const [initialAttachmentState] = useState(() => {
    const accepted = initialAttachments.filter(isComposerAttachmentSupported);
    return { accepted, rejectedCount: initialAttachments.length - accepted.length };
  });
  const didReportRejectedInitialAttachmentsRef = useRef(false);
  const didImportInitialAttachmentsRef = useRef(false);
  const isMountedRef = useRef(true);
  const importTokensRef = useRef(new Map<string, symbol>());
  const cancelledImportTokensRef = useRef(new Set<symbol>());
  const ownedEntryIdsRef = useRef(new Set<ComposerAttachmentReady['fileEntryId']>());
  const releasedOwnedEntryIdsRef = useRef(new Set<ComposerAttachmentReady['fileEntryId']>());
  const [attachments, setAttachmentState] = useState<ComposerAttachmentDraft[]>(() =>
    initialAttachmentState.accepted.map((attachment) =>
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
        await file.delete(entryId);
      } catch (error) {
        logger.warn('Failed to delete a cancelled attachment', toError(error), { entryId });
      }
    },
    [file],
  );
  const deleteEntryRef = useRef(deleteEntry);

  useEffect(() => {
    deleteEntryRef.current = deleteEntry;
  }, [deleteEntry]);

  const importAttachment = useCallback(
    async (source: ComposerAttachmentSource, token: symbol): Promise<ImportResult> => {
      const startedAt = Date.now();
      let importedSize = source.size;
      const finishImport = (result: ImportResult) => {
        if (__DEV__) {
          logger.debug('Attachment import finished', {
            durationMs: Date.now() - startedAt,
            kind: source.kind,
            result,
            size: importedSize ?? null,
          });
        }
        return result;
      };

      try {
        const resolved = await file.createInternalEntry({
          mediaType: source.mediaType,
          name: source.name,
          uri: source.uri,
        });
        importedSize = resolved.entry.size;

        if (cancelledImportTokensRef.current.delete(token)) {
          await deleteEntry(resolved.entry.id);
          return finishImport('ignored');
        }
        if (!isMountedRef.current) {
          await deleteEntry(resolved.entry.id);
          return finishImport('ignored');
        }
        if (importTokensRef.current.get(source.id) !== token) {
          await deleteEntry(resolved.entry.id);
          return finishImport('ignored');
        }

        importTokensRef.current.delete(source.id);
        ownedEntryIdsRef.current.add(resolved.entry.id);
        commitAttachments(
          attachmentsRef.current.map((attachment) =>
            attachment.id === source.id && attachment.status === 'importing'
              ? {
                  ...source,
                  fileEntryId: resolved.entry.id,
                  mediaType: resolved.entry.mediaType,
                  name: resolved.entry.filename,
                  size: importedSize,
                  status: 'ready' as const,
                  uri: resolved.uri,
                }
              : attachment,
          ),
        );
        return finishImport('ready');
      } catch {
        if (cancelledImportTokensRef.current.delete(token)) {
          return finishImport('ignored');
        }
        if (importTokensRef.current.get(source.id) !== token || !isMountedRef.current) {
          return finishImport('ignored');
        }

        importTokensRef.current.delete(source.id);
        commitAttachments(removeComposerAttachment(attachmentsRef.current, source.id));
        logger.warn('Failed to import an attachment', {
          kind: source.kind,
          size: importedSize ?? null,
        });
        return finishImport('failed');
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
      const supportedAttachments = nextAttachments.filter(isComposerAttachmentSupported);
      if (supportedAttachments.length < nextAttachments.length) {
        alert.show({ title: t('chat.attachments.unsupportedImageFormat') });
      }
      const seenIds = new Set(attachmentsRef.current.map((attachment) => attachment.id));
      const accepted = supportedAttachments.filter((attachment) => {
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
    [alert, commitAttachments, importAttachments, t],
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
      if (
        isComposerAttachmentReady(attachment) &&
        ownedEntryIdsRef.current.delete(attachment.fileEntryId)
      ) {
        void deleteEntry(attachment.fileEntryId);
      }
    },
    [commitAttachments, deleteEntry],
  );

  const clearAttachments = useCallback(() => {
    importTokensRef.current.clear();
    // ComposerSurface clears before awaiting send. Release temporary ownership
    // now; setAttachments rolls it back only when that send rejects.
    releasedOwnedEntryIdsRef.current = new Set(
      attachmentsRef.current.flatMap((attachment) =>
        isComposerAttachmentReady(attachment) &&
        ownedEntryIdsRef.current.delete(attachment.fileEntryId)
          ? [attachment.fileEntryId]
          : [],
      ),
    );
    commitAttachments([]);
  }, [commitAttachments]);

  const setAttachments = useCallback(
    (nextAttachments: ComposerAttachmentDraft[]) => {
      importTokensRef.current.clear();
      if (!isMountedRef.current) {
        for (const attachment of nextAttachments) {
          if (
            isComposerAttachmentReady(attachment) &&
            releasedOwnedEntryIdsRef.current.delete(attachment.fileEntryId)
          ) {
            void deleteEntry(attachment.fileEntryId);
          }
        }
        releasedOwnedEntryIdsRef.current.clear();
        return;
      }
      for (const attachment of nextAttachments) {
        if (
          isComposerAttachmentReady(attachment) &&
          releasedOwnedEntryIdsRef.current.has(attachment.fileEntryId)
        ) {
          ownedEntryIdsRef.current.add(attachment.fileEntryId);
        }
      }
      releasedOwnedEntryIdsRef.current.clear();
      commitAttachments([...nextAttachments]);
    },
    [commitAttachments, deleteEntry],
  );

  useEffect(() => {
    isMountedRef.current = true;
    const ownedEntryIds = ownedEntryIdsRef.current;
    return () => {
      isMountedRef.current = false;
      const abandonedEntryIds = [...ownedEntryIds];
      ownedEntryIds.clear();
      for (const entryId of abandonedEntryIds) {
        void deleteEntryRef.current(entryId);
      }
    };
  }, []);

  useEffect(() => {
    if (
      initialAttachmentState.rejectedCount > 0 &&
      !didReportRejectedInitialAttachmentsRef.current
    ) {
      didReportRejectedInitialAttachmentsRef.current = true;
      alert.show({ title: t('chat.attachments.unsupportedImageFormat') });
    }
    if (!didImportInitialAttachmentsRef.current) {
      didImportInitialAttachmentsRef.current = true;
      const sources = initialAttachmentState.accepted.filter(
        (attachment): attachment is ComposerAttachmentSource =>
          !isComposerAttachmentReady(attachment),
      );
      if (sources.length > 0) void importAttachments(sources);
    }
  }, [alert, importAttachments, initialAttachmentState, t]);

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
