import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntryId } from '@/shared/data/types/file';

import type { ComposerDraft } from '../ComposerDraft';
import type { ComposerAttachmentStore } from '../context/ComposerProvider';
import {
  appendComposerAttachments,
  cleanupDropStagedFile,
  type ComposerAttachmentDraft,
  type ComposerAttachmentSource,
  createReadyAttachmentDraft,
  isComposerAttachmentReady,
  isDropStagedFile,
  removeComposerAttachment,
  replaceComposerAttachment,
  type ComposerAttachmentReady,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('useManagedComposerAttachments');
type ImportResult = 'failed' | 'ignored' | 'ready';

/** Imports belong to My Files; this session owns only their draft references. */
export function useManagedComposerAttachments(
  buffer: ComposerDraft,
  workspaceSessionId?: string,
  workspaceFolderId?: string | null,
): ComposerAttachmentStore {
  const { t } = useTranslation();
  const { toast } = useToast();
  const file = useBackendModule('file');
  const isMountedRef = useRef(true);
  const attachments = useSyncExternalStore(
    buffer.attachments.subscribe,
    buffer.attachments.get,
    buffer.attachments.get,
  );
  const listeners = useRef(new Set<(attachments: readonly ComposerAttachmentDraft[]) => void>());
  const subscribeAttachmentChanges = useCallback(
    (listener: (attachments: readonly ComposerAttachmentDraft[]) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  const commitAttachments = useCallback(
    (next: ComposerAttachmentDraft[], notify = true) => {
      buffer.attachments.set(next);
      if (notify) for (const listener of listeners.current) listener(next);
    },
    [buffer],
  );

  const importAttachment = useCallback(
    async (
      source: ComposerAttachmentSource | ComposerAttachmentReady,
      token: symbol,
    ): Promise<ImportResult> => {
      try {
        const resolved =
          isComposerAttachmentReady(source) && (workspaceSessionId || workspaceFolderId)
            ? await file.prepareWorkspaceAttachment({
                fileEntryId: source.fileEntryId,
                ...(workspaceSessionId
                  ? { sessionId: workspaceSessionId }
                  : { folderId: workspaceFolderId! }),
              })
            : await file.createInternalEntry({
                ...(workspaceSessionId ? { workspaceSessionId } : {}),
                ...(!workspaceSessionId && workspaceFolderId
                  ? { folderId: workspaceFolderId }
                  : {}),
                mediaType: source.mediaType,
                name: source.name,
                uri: source.uri,
              });
        // The managed entry owns the bytes now; a drop's staged cache copy
        // would otherwise linger until the OS evicts Caches.
        if (isDropStagedFile(source.uri)) void cleanupDropStagedFile(source.uri);
        // Removal or replacement revokes the token, including while another chat is open.
        if (buffer.imports.get(source.id) !== token) return 'ignored';
        buffer.imports.delete(source.id);
        commitAttachments(
          buffer.attachments
            .get()
            .map((attachment) =>
              attachment.id === source.id
                ? createReadyAttachmentDraft(resolved, source.id)
                : attachment,
            ),
        );
        return 'ready';
      } catch {
        // The failed import owns no bytes; a drop's staged cache copy would
        // otherwise linger with no one left to clean it.
        if (isDropStagedFile(source.uri)) void cleanupDropStagedFile(source.uri);
        if (buffer.imports.get(source.id) !== token) return 'ignored';
        buffer.imports.delete(source.id);
        commitAttachments(removeComposerAttachment(buffer.attachments.get(), source.id));
        logger.warn('Failed to import an attachment', {
          kind: source.kind,
          size: source.size ?? null,
        });
        return 'failed';
      }
    },
    [buffer, commitAttachments, file, workspaceSessionId, workspaceFolderId],
  );

  const importAttachments = useCallback(
    async (sources: readonly (ComposerAttachmentSource | ComposerAttachmentReady)[]) => {
      const results = await Promise.all(
        sources.map((source) => {
          const token = Symbol(source.id);
          buffer.imports.set(source.id, token);
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
    [buffer, importAttachment, t, toast],
  );

  const addAttachments = useCallback(
    (next: ComposerAttachmentDraft[]) => {
      const current = buffer.attachments.get();
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
      const sources = accepted.flatMap(
        (attachment): (ComposerAttachmentSource | ComposerAttachmentReady)[] => {
          // A restored tile still marked importing lost its import when the
          // tokens cleared; restart it rather than leave it blocked forever.
          if (attachment.status === 'importing') {
            const { status: _status, ...source } = attachment;
            return [source];
          }
          return attachment.status === undefined ||
            (Boolean(workspaceSessionId || workspaceFolderId) &&
              isComposerAttachmentReady(attachment))
            ? [attachment]
            : [];
        },
      );
      commitAttachments([
        ...current,
        ...accepted.map((attachment) => {
          if (isComposerAttachmentReady(attachment) && !workspaceSessionId && !workspaceFolderId)
            return attachment;
          const { fileEntryId: _fileEntryId, status: _status, ...source } = attachment;
          return { ...source, status: 'importing' as const };
        }),
      ]);
      if (sources.length > 0) void importAttachments(sources);
    },
    [buffer, commitAttachments, importAttachments, workspaceSessionId, workspaceFolderId],
  );

  const restoreAttachments = useCallback(
    (restored: ComposerAttachmentReady[]) => {
      if (restored.length)
        commitAttachments(appendComposerAttachments(buffer.attachments.get(), restored));
    },
    [buffer, commitAttachments],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      buffer.imports.delete(id);
      commitAttachments(removeComposerAttachment(buffer.attachments.get(), id));
    },
    [buffer, commitAttachments],
  );

  const clearAttachments = useCallback(() => {
    buffer.imports.clear();
    commitAttachments([], false);
  }, [buffer, commitAttachments]);

  const setAttachments = useCallback(
    (next: ComposerAttachmentDraft[]) => {
      buffer.imports.clear();
      commitAttachments([...next], false);
      // Clearing the tokens orphaned every in-flight import, so a tile
      // restored as still importing has no operation left that can finish
      // it. Restart those imports instead of restoring a permanently
      // blocked tile.
      const restored = next.flatMap((attachment): ComposerAttachmentSource[] => {
        if (attachment.status !== 'importing') return [];
        const { status: _status, ...source } = attachment;
        return [source];
      });
      if (restored.length > 0) void importAttachments(restored);
    },
    [buffer, commitAttachments, importAttachments],
  );

  const replaceAttachment = useCallback(
    (attachmentId: string, sourceId: FileEntryId, replacement: ComposerAttachmentReady) => {
      if (!isMountedRef.current) return false;
      const next = replaceComposerAttachment(
        buffer.attachments.get(),
        attachmentId,
        sourceId,
        replacement,
      );
      if (!next) return false;
      buffer.imports.delete(attachmentId);
      commitAttachments(next);
      return true;
    },
    [buffer, commitAttachments],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sources = buffer.attachments.get().flatMap((item): ComposerAttachmentSource[] => {
      if (item.status !== 'importing' || buffer.imports.has(item.id)) return [];
      const { status: _status, ...source } = item;
      return [source];
    });
    if (sources.length) void importAttachments(sources);
  }, [buffer, importAttachments]);

  return useMemo(
    () => ({
      addAttachments,
      attachments,
      clearAttachments,
      removeAttachment,
      replaceAttachment,
      restoreAttachments,
      setAttachments,
      subscribeAttachmentChanges,
    }),
    [
      addAttachments,
      attachments,
      clearAttachments,
      removeAttachment,
      replaceAttachment,
      restoreAttachments,
      setAttachments,
      subscribeAttachmentChanges,
    ],
  );
}
