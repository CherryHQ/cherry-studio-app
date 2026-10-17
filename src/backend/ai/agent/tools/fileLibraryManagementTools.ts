import * as z from 'zod';

import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { TrashService } from '@/backend/data/services/TrashService';
import type { TrashRuntime } from '@/backend/services/trash';
import { TrashKindSchema } from '@/shared/data/api/schemas/trash';
import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';
import { SafeNameSchema } from '@/shared/data/types/file';
import { fileNameKey } from '@/shared/data/types/fileLibrary';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export type FileLibraryTrashAccess = Pick<TrashRuntime, 'trashFile' | 'trashFolder' | 'restore'> & {
  entries: Pick<TrashService, 'list'>;
};

const itemSchema = z.strictObject({
  kind: z.enum(['file', 'folder']),
  id: z
    .uuid()
    .describe(
      'fileId or folder id from library_search_files/library_list_folders; not a fileEntryId.',
    ),
});
const foldersSchema = z.strictObject({
  query: z.string().trim().max(255).default(''),
  parent_id: z
    .uuid()
    .nullable()
    .optional()
    .describe('Omit to search all folders; null lists root folders.'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(50),
});
const moveSchema = itemSchema.extend({
  destination_folder_id: z.uuid().nullable().describe('Folder id, or null for the library root.'),
});
const renameSchema = itemSchema.extend({ name: SafeNameSchema });
const trashListSchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
const restoreSchema = z.strictObject({ kind: TrashKindSchema, id: z.uuid() });

/** Library-wide operations, independent of the conversation workspace and found through tool_search. */
export function createFileLibraryManagementTools(
  library: FileLibraryService,
  trash: FileLibraryTrashAccess,
): RuntimeTool[] {
  function tool<T>(
    name: BuiltInToolCapabilityId,
    displayName: string,
    approval: 'auto' | 'ask',
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
      approval,
      deferred: true,
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
      'auto',
      'Find library folders by name, or list the children of parent_id. Returns ids for moving or renaming; follow nextPage with the same filters.',
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
      'ask',
      'Move a file (with its versions) or a folder (with its subtree) into another folder. A name collision adds a suffix; the result reports the saved name.',
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
      'ask',
      'Rename a file or folder in place. name is a single name, not a path; a conflicting name is rejected.',
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
      'ask',
      'Move a file (with its versions) or a folder (with its subtree) to trash for 30 days. Its conversation references stay unavailable until restored.',
      itemSchema,
      async ({ kind, id }, signal) => {
        if (kind === 'folder') await trash.trashFolder(id, signal);
        else await trash.trashFile((await library.file(id)).currentEntryId, signal);
        return { status: 'trashed', kind, id };
      },
    ),
    tool(
      'library_list_trash',
      'List recently deleted files',
      'auto',
      'List trashed files, folders and old versions, newest first. Follow nextCursor.',
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
      'ask',
      'Restore a trashed item by kind and id from library_list_trash or library_trash_item, to its original folder or else the root. A name collision adds a suffix.',
      restoreSchema,
      async ({ kind, id }, signal) => {
        await trash.restore(kind, id, signal);
        return { status: 'restored', kind, id };
      },
    ),
  ];
}
