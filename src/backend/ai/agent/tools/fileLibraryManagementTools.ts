import * as z from 'zod';

import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { TrashService } from '@/backend/data/services/TrashService';
import { notifyFileChange } from '@/backend/services/file/fileStorage';
import type { TrashRuntime } from '@/backend/services/trash';
import { TrashKindSchema } from '@/shared/data/api/schemas/trash';
import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';
import { SafeNameSchema } from '@/shared/data/types/file';
import { fileNameKey } from '@/shared/data/types/fileLibrary';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export type FileLibraryTrashAccess = {
  entries: Pick<TrashService, 'list'>;
  restore: TrashRuntime['restore'];
};

const itemSchema = z.strictObject({
  kind: z.enum(['file', 'folder']),
  id: z
    .uuid()
    .describe(
      'Exact fileId or folder id returned by library search/list tools. Never a fileEntryId or path.',
    ),
});
const foldersSchema = z.strictObject({
  query: z.string().trim().max(255).default(''),
  parent_id: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      'Omit to search all folders; null lists root folders; an id lists its direct children.',
    ),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(50),
});
const moveSchema = itemSchema.extend({
  destination_folder_id: z
    .uuid()
    .nullable()
    .describe('Destination folder id from library_list_folders, or null for the library root.'),
});
const renameSchema = itemSchema.extend({ name: SafeNameSchema });
const trashListSchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
const restoreSchema = z.strictObject({
  kind: TrashKindSchema,
  id: z.uuid().describe('Copy kind and id together from library_list_trash or library_trash_item.'),
});

/** Library-wide operations use explicit approval, independent of the conversation workspace. */
export function createFileLibraryManagementTools(
  library: FileLibraryService,
  trash: FileLibraryTrashAccess,
): RuntimeTool[] {
  function tool<T>(
    name: BuiltInToolCapabilityId,
    displayName: string,
    description: string,
    schema: z.ZodType<T>,
    execute: (input: T, signal: AbortSignal) => Promise<RuntimeToolResult['value']>,
  ): RuntimeTool {
    return {
      ref: { source: 'builtin', capabilityId: name },
      providerName: name,
      displayName,
      description,
      inputSchema: toRuntimeInputSchema(schema),
      approval: 'ask',
      autoApprovalEligible: false,
      async execute({ input, signal }) {
        const parsed = schema.parse(input);
        signal.throwIfAborted();
        return { value: await execute(parsed, signal), artifacts: [] };
      },
    };
  }

  async function currentItem(
    kind: 'file' | 'folder',
    id: string,
  ): Promise<RuntimeToolResult['value']> {
    if (kind === 'folder') {
      const folder = await library.folder(id);
      return folder && folder.deletedAt === null
        ? { kind, id, name: folder.name, parentId: folder.parentId }
        : null;
    }
    const file = await library.file(id);
    return { kind, id, name: file.name, folderId: file.folderId, fileEntryId: file.currentEntryId };
  }

  return [
    tool(
      'library_list_folders',
      'Find library folders',
      'Find active folders throughout the file library by name, or browse children by parent_id. Returns stable ids and parent ids for moving or renaming. Follow nextPage with the same filters. Resolve ambiguous names before changing anything. Every call requires user confirmation.',
      foldersSchema,
      async ({ query, parent_id, page, limit }) => {
        const nameQuery = fileNameKey(query);
        const matches = (await library.folders()).filter(
          (folder) =>
            (parent_id === undefined || folder.parentId === parent_id) &&
            fileNameKey(folder.name).includes(nameQuery),
        );
        const start = (page - 1) * limit;
        return {
          folders: matches
            .slice(start, start + limit)
            .map(({ id, parentId, name }) => ({ id, parentId, name })),
          nextPage: start + limit < matches.length ? page + 1 : null,
        };
      },
    ),
    tool(
      'library_move_item',
      'Move library item',
      'Move one file (all its versions) or folder (its whole subtree) to another library folder or the root. Use exact ids from library_search_files/library_list_folders. Name collisions receive a suffix; the result reports the saved name. Moving a folder into itself or a descendant is rejected. Requires user confirmation.',
      moveSchema,
      async ({ kind, id, destination_folder_id }, signal) => {
        if (kind === 'folder')
          await library.updateFolder(id, { parentId: destination_folder_id }, signal);
        else await library.updateFile(id, { folderId: destination_folder_id }, signal);
        return { status: 'moved', item: await currentItem(kind, id) };
      },
    ),
    tool(
      'library_rename_item',
      'Rename library item',
      'Rename one library file or folder without changing its location or contents. Use exact ids from library_search_files/library_list_folders, and a single name, not a path. Conflicting names are rejected. Requires user confirmation.',
      renameSchema,
      async ({ kind, id, name }, signal) => {
        if (kind === 'folder') await library.updateFolder(id, { name }, signal);
        else await library.updateFile(id, { name }, signal);
        return { status: 'renamed', item: await currentItem(kind, id) };
      },
    ),
    tool(
      'library_trash_item',
      'Move library item to trash',
      'Delete one library file or folder by moving it to trash for 30 days. A file includes all versions; a folder includes its active subtree and file versions. Conversation references become unavailable until restored. Use exact ids from library_search_files/library_list_folders. Requires user confirmation. Returns kind and id for library_restore_item; this never permanently deletes bytes.',
      itemSchema,
      async ({ kind, id }, signal) => {
        let entryIds: string[];
        if (kind === 'folder') entryIds = await library.trashFolder(id, signal);
        else {
          const file = await library.file(id);
          signal.throwIfAborted();
          entryIds = await library.trashFileEntry(file.currentEntryId, false, signal);
        }
        for (const entryId of entryIds) notifyFileChange(entryId);
        return { status: 'trashed', kind, id, affectedVersions: entryIds.length };
      },
    ),
    tool(
      'library_list_trash',
      'List recently deleted files',
      'List recoverable library files, folders, and old versions, newest deletion first. Copy kind and id together to library_restore_item. Follow nextCursor. Items are retained for 30 days. Every call requires user confirmation.',
      trashListSchema,
      async (input, signal) => {
        const result = await trash.entries.list(input, signal);
        return {
          items: result.items.map(({ kind, id, title, deletedAt, size }) => ({
            kind,
            id,
            name: title,
            deletedAt,
            size,
          })),
          nextCursor: result.nextCursor ?? null,
        };
      },
    ),
    tool(
      'library_restore_item',
      'Restore library item',
      'Restore a trashed file, folder subtree, or old version using kind and id from library_list_trash/library_trash_item. Restores the original location when available, otherwise the library root; name collisions receive a suffix. Requires user confirmation. Search/list again to find its current location and name.',
      restoreSchema,
      async ({ kind, id }, signal) => {
        await trash.restore(kind, id, signal);
        return { status: 'restored', kind, id };
      },
    ),
  ];
}
