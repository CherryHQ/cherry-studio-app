import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ComposerAttachmentStore } from '../context/ComposerProvider';
import {
  appendComposerAttachments,
  cleanupDropStagedFile,
  type ComposerAttachmentDraft,
  type ComposerAttachmentSource,
  type ComposerInitialAttachment,
  isComposerAttachmentReady,
  isComposerImageMediaType,
  isDropStagedFile,
  removeComposerAttachment,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('useManagedComposerAttachments');
const emptyInitialAttachments: readonly ComposerInitialAttachment[] = [];
type ImportResult = 'failed' | 'ignored' | 'ready';

/** Imports belong to My Files; this session owns only their draft references. */
export function useManagedComposerAttachments(
  initialAttachments: readonly ComposerInitialAttachment[] = emptyInitialAttachments,
): ComposerAttachmentStore {
  const { t } = useTranslation();
  const { toast } = useToast();
  const file = useBackendModule('file');
  const [initialSources] = useState(() =>
    initialAttachments.filter(
      (attachment): attachment is ComposerAttachmentSource =>
        !isComposerAttachmentReady(attachment),
    ),
  );
  const didImportInitialAttachmentsRef = useRef(false);
  const isMountedRef = useRef(true);
  const importTokensRef = useRef(new Map<string, symbol>());
  const [attachments, setAttachmentState] = useState<ComposerAttachmentDraft[]>(() =>
    initialAttachments.map((attachment) =>
      isComposerAttachmentReady(attachment) ? attachment : { ...attachment, status: 'importing' },
    ),
  );
  const attachmentsRef = useRef(attachments);

  const commitAttachments = useCallback((next: ComposerAttachmentDraft[]) => {
    attachmentsRef.current = next;
    if (isMountedRef.current) setAttachmentState(next);
  }, []);

  const importAttachment = useCallback(
    async (source: ComposerAttachmentSource, token: symbol): Promise<ImportResult> => {
      try {
        const resolved = await file.createInternalEntry({
          mediaType: source.mediaType,
          name: source.name,
          uri: source.uri,
        });
        // The managed entry owns the bytes now; a drop's staged cache copy
        // would otherwise linger until the OS evicts Caches.
        if (isDropStagedFile(source.uri)) void cleanupDropStagedFile(source.uri);
        // A removed tile or departed screen cannot restore a stale reference.
        // The completed import remains in My Files in either case.
        if (importTokensRef.current.get(source.id) !== token || !isMountedRef.current)
          return 'ignored';
        importTokensRef.current.delete(source.id);
        commitAttachments(
          attachmentsRef.current.map((attachment) =>
            attachment.id === source.id
              ? {
                  id: source.id,
                  fileEntryId: resolved.entry.id,
                  kind: isComposerImageMediaType(resolved.entry.mediaType) ? 'image' : 'file',
                  mediaType: resolved.entry.mediaType,
                  name: resolved.entry.filename,
                  size: resolved.entry.size,
                  status: 'ready',
                  uri: resolved.uri,
                }
              : attachment,
          ),
        );
        return 'ready';
      } catch {
        // The failed import owns no bytes; a drop's staged cache copy would
        // otherwise linger with no one left to clean it.
        if (isDropStagedFile(source.uri)) void cleanupDropStagedFile(source.uri);
        if (importTokensRef.current.get(source.id) !== token || !isMountedRef.current)
          return 'ignored';
        importTokensRef.current.delete(source.id);
        commitAttachments(removeComposerAttachment(attachmentsRef.current, source.id));
        logger.warn('Failed to import an attachment', {
          kind: source.kind,
          size: source.size ?? null,
        });
        return 'failed';
      }
    },
    [commitAttachments, file],
  );

  const importAttachments = useCallback(
    async (sources: readonly ComposerAttachmentSource[]) => {
      const results = await Promise.all(
        sources.map((source) => {
          const token = Symbol(source.id);
          importTokensRef.current.set(source.id, token);
          return importAttachment(source, token);
        }),
      );
      const failureCount = results.filter((result) => result === 'failed').length;
      if (isMountedRef.current && failureCount > 0) {
        toast.show({
          label: t('chat.attachments.importFailed', { count: failureCount }),
          variant: 'danger',
        });
      }
    },
    [importAttachment, t, toast],
  );

  const addAttachments = useCallback(
    (next: ComposerAttachmentDraft[]) => {
      const current = attachmentsRef.current;
      const accepted = appendComposerAttachments(current, next).slice(current.length);
      // A rejected draft (duplicate or over the limit) owns no reference; a
      // drop-staged source behind it would linger with no one to clean it.
      const acceptedIds = new Set(accepted.map((attachment) => attachment.id));
      for (const draft of next) {
        if (!acceptedIds.has(draft.id) && isDropStagedFile(draft.uri)) {
          void cleanupDropStagedFile(draft.uri);
        }
      }
      if (accepted.length === 0) return;
      const sources = accepted.filter(
        (attachment): attachment is ComposerAttachmentSource => attachment.status === undefined,
      );
      commitAttachments([
        ...current,
        ...accepted.map((attachment) =>
          isComposerAttachmentReady(attachment)
            ? attachment
            : { ...attachment, status: 'importing' as const },
        ),
      ]);
      if (sources.length > 0) void importAttachments(sources);
    },
    [commitAttachments, importAttachments],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      importTokensRef.current.delete(id);
      commitAttachments(removeComposerAttachment(attachmentsRef.current, id));
    },
    [commitAttachments],
  );

  const clearAttachments = useCallback(() => {
    importTokensRef.current.clear();
    commitAttachments([]);
  }, [commitAttachments]);

  const setAttachments = useCallback(
    (next: ComposerAttachmentDraft[]) => {
      importTokensRef.current.clear();
      commitAttachments([...next]);
    },
    [commitAttachments],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!didImportInitialAttachmentsRef.current) {
      didImportInitialAttachmentsRef.current = true;
      if (initialSources.length > 0) void importAttachments(initialSources);
    }
  }, [importAttachments, initialSources]);

  return useMemo(
    () => ({ addAttachments, attachments, clearAttachments, removeAttachment, setAttachments }),
    [addAttachments, attachments, clearAttachments, removeAttachment, setAttachments],
  );
}
