import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { AgentService } from '@/backend/data/services/AgentService';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { downloadFile, FileDownloadError } from '@/backend/services/download';
import { discardInternalEntries } from '@/backend/services/file/fileStorage';
import { importManagedFile } from '@/backend/services/file/importManagedFile';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  DeepseekImportError,
  type DeepseekImportModule,
  type DeepseekImportResult,
} from '@/shared/contracts/deepseekImport';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DEEPSEEK_AGENT_AVATAR } from '@/shared/data/types/agent';
import { type FileEntry, SafeNameSchema } from '@/shared/data/types/file';
import { parseDeepseekExportUrl } from '@/shared/utils/deepseekExportUrl';

import {
  type DeepseekArchiveConversation,
  readDeepseekImageMediaType,
  readDeepseekJson,
  unpackDeepseekArchive,
} from './deepseekArchive';
import { convertDeepseekConversation, deepseekFileKey } from './deepseekConversation';
import { DEEPSEEK_IMPORT_LIMITS, deepseekConversationSchema } from './deepseekFormat';

const logger = loggerService.withContext('DeepseekImport');

/** Composition owns cancellation and joins accepted work before its database is closed. */
export class DeepseekImportRuntime implements DeepseekImportModule {
  private readonly files: FileEntryService;
  private readonly agents: AgentService;
  private pending: Promise<DeepseekImportResult> | undefined;
  private controller: AbortController | undefined;
  private stopped = false;

  constructor(
    private readonly dbService: DbService,
    preference: PreferenceService,
  ) {
    this.files = new FileEntryService(dbService);
    this.agents = new AgentService(dbService, preference);
  }

  hasPendingStorageWork = () => this.pending !== undefined;

  importFromUrl: DeepseekImportModule['importFromUrl'] = (input, options) => {
    if (this.pending || this.stopped || storageMutationGate.isFrozen) {
      logger.warn('DeepSeek import failed', { phase: 'admission', code: 'busy' });
      return Promise.reject(new DeepseekImportError('busy'));
    }
    this.controller = new AbortController();
    const linked = linkAbortSignals([this.controller.signal, options.signal]);
    const promise = this.run(input, linked.signal, options.onProgress).finally(() => {
      linked.dispose();
      this.controller = undefined;
      this.pending = undefined;
    });
    this.pending = promise;
    return promise;
  };

  dispose = async () => {
    this.stopped = true;
    this.controller?.abort();
    await this.pending?.catch(() => {});
  };

  private async run(
    input: string,
    signal: AbortSignal,
    report: Parameters<DeepseekImportModule['importFromUrl']>[1]['onProgress'],
  ): Promise<DeepseekImportResult> {
    const root = new Directory(Paths.cache, `deepseek-import-${randomUUID()}`);
    const importedFiles = new Map<string, FileEntry>();
    const usedFileIds = new Set<string>();
    let committed = false;
    let phase: 'link' | 'download' | 'archive' | 'conversation' | 'write' = 'link';
    const progress: typeof report = (value) => {
      try {
        report(value);
      } catch {
        /* A view cannot change the import outcome. */
      }
    };
    try {
      signal.throwIfAborted();
      const url = parseDeepseekExportUrl(input);
      phase = 'download';
      root.create({ intermediates: true });
      const archive = new File(root, 'export.zip');
      progress({ phase: 'downloading', completed: 0, total: null });
      await downloadFile({
        url,
        destination: archive.uri,
        validation: 'caller',
        maxBytes: DEEPSEEK_IMPORT_LIMITS.archiveBytes,
        timeoutMs: 10 * 60 * 1000,
        signal,
        onProgress: (value) => {
          if (value.status === 'downloading')
            progress({
              phase: 'downloading',
              completed: value.receivedBytes,
              total: value.totalBytes,
            });
        },
      });
      signal.throwIfAborted();
      phase = 'archive';
      progress({ phase: 'reading', completed: 0, total: archive.size });
      let percentage = -1;
      const contents = new Directory(root, 'contents');
      const { conversations, files } = await unpackDeepseekArchive(
        archive,
        contents,
        signal,
        (completed, total) => {
          const next = Math.floor((completed / total) * 100);
          if (next !== percentage) {
            percentage = next;
            progress({ phase: 'reading', completed, total });
          }
        },
      );
      phase = 'conversation';
      const slice = createTimeSlice(signal);
      const readable: DeepseekArchiveConversation[] = [];
      let hasReadableConversation = false;
      let hasMessages = false;
      for (const item of conversations) {
        await slice();
        const conversation = await this.readConversation(
          files.get(`chat_sessions/${item.id}.json`),
        );
        if (!conversation) continue;
        hasReadableConversation = true;
        // A nonempty tree needs a question to keep any answers. A truly empty list is valid.
        if (conversation.messages.length > 0) {
          if (!conversation.messages.some((message) => message.role === 'USER')) continue;
          hasMessages = true;
        }
        readable.push(item);
        for (const message of conversation.messages) {
          for (const fragment of message.fragments) {
            if (fragment.type !== 'FILE') continue;
            for (const file of fragment.files) {
              if (!file.is_image || !file.export_path) continue;
              const sourceUri = files.get(file.export_path);
              if (sourceUri === undefined) continue;
              const key = deepseekFileKey(item.id, file);
              if (importedFiles.has(key)) continue;
              await slice();
              storageMutationGate.assertWritable();
              try {
                const entry = await importManagedFile(
                  this.files,
                  {
                    uri: sourceUri,
                    name: attachmentName(file.file_name, file.export_path),
                    mediaType: readDeepseekImageMediaType(new File(sourceUri), file.export_path),
                  },
                  signal,
                );
                importedFiles.set(key, entry);
              } catch {
                signal.throwIfAborted();
                // The message keeps the attachment's name as text, like a file absent from the export.
              }
            }
          }
        }
      }
      if (!hasReadableConversation) throw new DeepseekImportError('invalid');
      if (!hasMessages) throw new DeepseekImportError('empty');
      phase = 'write';
      progress({ phase: 'importing', completed: 0, total: readable.length });
      const now = Date.now();
      // One transaction keeps the import atomic. Other writes wait for it but are not blocked
      // forever: the loop yields to the app regularly and leaving the page cancels and rolls back.
      const result = await this.dbService.withWriteTx(async (tx) => {
        signal.throwIfAborted();
        storageMutationGate.assertWritable();
        const agent = await this.agents.createTx(tx, {
          name: 'DeepSeek',
          avatar: DEEPSEEK_AGENT_AVATAR,
        });
        let missingAttachments = 0;
        let sessions = 0;
        let messages = 0;
        let completed = 0;
        for (const item of readable) {
          await slice();
          const conversation = await this.readConversation(
            files.get(`chat_sessions/${item.id}.json`),
          );
          progress({ phase: 'importing', completed: ++completed, total: readable.length });
          if (!conversation) continue;
          const converted = convertDeepseekConversation(conversation, {
            agentId: agent.id,
            conversationId: item.id,
            insertedAt: item.insertedAt,
            updatedAt: item.updatedAt,
            now,
            files: importedFiles,
            createId: createOrderedUuid,
          });
          if (conversation.messages.length > 0 && converted.messages.length === 0) continue;
          signal.throwIfAborted();
          await tx.insert(agentSessionTable).values(converted.session);
          // Stay under SQLite's historical bound on statement parameters.
          for (let offset = 0; offset < converted.messages.length; offset += 40) {
            await slice();
            const batch = converted.messages.slice(offset, offset + 40);
            await tx.insert(agentSessionMessageTable).values(batch);
            if (importedFiles.size > 0) {
              for (const { data } of batch)
                for (const part of data.parts)
                  if (part.type === 'file') usedFileIds.add(part.fileEntryId);
            }
          }
          missingAttachments += converted.missingAttachments;
          messages += converted.messages.length;
          sessions += 1;
        }
        signal.throwIfAborted();
        if (messages === 0) throw new DeepseekImportError('empty');
        return {
          agentId: agent.id,
          sessions,
          messages,
          missingAttachments,
          skippedConversations: conversations.length - sessions,
        };
      });
      committed = true;
      publishDataApiChanges(['/agents', `/agents/${result.agentId}`, '/agent-sessions']);
      if (result.skippedConversations > 0 || result.missingAttachments > 0)
        logger.warn('DeepSeek import completed with skips', {
          importedConversations: result.sessions,
          skippedConversations: result.skippedConversations,
          missingAttachments: result.missingAttachments,
        });
      return result;
    } catch (cause) {
      if (signal.aborted) throw signal.reason;
      const error =
        cause instanceof DeepseekImportError
          ? cause
          : new DeepseekImportError(cause instanceof FileDownloadError ? 'download' : 'failed', {
              cause,
            });
      logger.warn('DeepSeek import failed', {
        phase: error.code === 'empty' ? 'conversation' : phase,
        code: error.code,
        reasonCode: error.reasonCode,
        statusCode: cause instanceof FileDownloadError ? cause.statusCode : undefined,
      });
      throw error;
    } finally {
      const discardedFiles = [...importedFiles.values()].filter(
        (entry) => !committed || !usedFileIds.has(entry.id),
      );
      if (discardedFiles.length > 0) await discardInternalEntries(this.files, discardedFiles);
      try {
        if (root.exists) root.delete();
      } catch (error) {
        logger.warn('Failed to remove import staging', error as Error);
      }
    }
  }

  /** An unreadable conversation is skipped rather than failing the whole import. */
  private async readConversation(uri: string | undefined) {
    if (uri === undefined) return undefined;
    try {
      const parsed = deepseekConversationSchema.safeParse(await readDeepseekJson(new File(uri)));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (!(error instanceof DeepseekImportError)) throw error;
    }
    return undefined;
  }
}

/** Called at each unit of work: checks cancellation and yields to the app once 50 ms have passed. */
function createTimeSlice(signal: AbortSignal) {
  let started = Date.now();
  return async () => {
    signal.throwIfAborted();
    if (Date.now() - started < 50) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
    started = Date.now();
  };
}

/** Archive names are display text; make them safe file names instead of rejecting them. */
function attachmentName(name: string, exportPath: string): string {
  const candidate = (name || exportPath.split('/').at(-1) || '')
    .replace(/[\\/\0]/g, '_')
    .trim()
    .slice(0, 255);
  const parsed = SafeNameSchema.safeParse(candidate);
  return parsed.success ? parsed.data : 'image';
}
