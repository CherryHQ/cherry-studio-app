import * as z from 'zod';

import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { workspacePathSegments } from '@/shared/data/types/fileLibrary';

import type { ManagedFileResolver } from '../resources/managedFileResolver';
import type { RuntimeTool } from '../runtime';
import { createReadFileTool, readFileInputSchema } from './readFileTool';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const searchSchema = z.strictObject({
  query: z.string().trim().max(255),
  cursor: z.string().optional(),
});
const directorySchema = z.strictObject({
  path: z.string().max(4096).default('.'),
  cursor: z.string().optional(),
});
const createFolderSchema = z.strictObject({ path: z.string().min(1).max(4096) });

export function createFileLibraryTools(
  access: WorkspaceFileAccess,
  files: ManagedFileResolver,
  parser: DocumentParserMode,
): RuntimeTool[] {
  const libraryReadSchema = readFileInputSchema
    .omit({ path: true })
    .extend({ file_entry_id: z.string() });
  const tools: RuntimeTool[] = [
    {
      ref: { source: 'builtin', capabilityId: 'library_search_files' },
      providerName: 'library_search_files',
      displayName: 'Search file library',
      approval: 'ask',
      autoApprovalEligible: false,
      description:
        'Search active file names across the file library. Every call, including pagination, requires user confirmation. An empty query lists files. Use library_read_file for approved reads outside the workspace.',
      inputSchema: toRuntimeInputSchema(searchSchema),
      async execute({ input }) {
        const parsed = searchSchema.parse(input);
        const result = await access.library.list({ search: parsed.query, cursor: parsed.cursor });
        return {
          value: {
            files: result.items.map((file) => ({
              fileId: file.id,
              fileEntryId: file.entry.id,
              revision: file.entry.updatedAt,
              name: file.name,
              mediaType: file.entry.mediaType,
              size: file.entry.size,
            })),
            nextCursor: result.nextCursor ?? null,
          },
          artifacts: [],
        };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: 'library_read_file' },
      providerName: 'library_read_file',
      displayName: 'Read library file',
      approval: 'ask',
      autoApprovalEligible: false,
      description:
        'Read a file outside the workspace, with explicit user confirmation for every call. Uses the same paging and image rules as read_file. Approval permits editing this source into a new workspace file during this turn; it never gives read_file unrestricted library access.',
      inputSchema: toRuntimeInputSchema(libraryReadSchema),
      async execute(call) {
        const parsed = libraryReadSchema.parse(call.input);
        const id = FileEntryIdSchema.parse(parsed.file_entry_id);
        const reader = createReadFileTool(files, { fileEntryIds: new Set([id]) }, parser);
        const result = await reader.execute({ ...call, input: parsed });
        if (
          typeof result.value === 'object' &&
          result.value !== null &&
          !Array.isArray(result.value) &&
          result.value.status === 'ok'
        )
          access.approveLibraryRead(id);
        return result;
      },
    },
  ];
  const workspaceId = access.folderId;
  if (!workspaceId) return tools;
  tools.push(
    {
      ref: { source: 'builtin', capabilityId: 'list_workspace' },
      providerName: 'list_workspace',
      displayName: 'List workspace',
      approval: 'auto',
      description:
        'List a relative workspace directory. Files include their current fileEntryId; use it as base_file_entry_id when changing an existing path. No device paths are exposed.',
      inputSchema: toRuntimeInputSchema(directorySchema),
      async execute({ input }) {
        const parsed = directorySchema.parse(input);
        const folder = await access.library.resolveDirectory(workspaceId, parsed.path);
        const [folders, result] = await Promise.all([
          access.library.folders(),
          access.library.list({ folderId: folder.id, cursor: parsed.cursor }),
        ]);
        return {
          value: {
            path: parsed.path,
            folders: folders.filter((item) => item.parentId === folder.id).map((item) => item.name),
            files: result.items.map((file) => ({
              name: file.name,
              fileEntryId: file.entry.id,
              revision: file.entry.updatedAt,
              size: file.entry.size,
              mediaType: file.entry.mediaType,
            })),
            nextCursor: result.nextCursor ?? null,
          },
          artifacts: [],
        };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: 'find_workspace_files' },
      providerName: 'find_workspace_files',
      displayName: 'Find workspace files',
      approval: 'auto',
      description:
        'Find file names within the workspace and its descendants. Results identify current versions. Outside files require library_search_files and user approval.',
      inputSchema: toRuntimeInputSchema(searchSchema),
      async execute({ input }) {
        const parsed = searchSchema.parse(input);
        const [result, folders] = await Promise.all([
          access.library.list({ workspaceId, search: parsed.query, cursor: parsed.cursor }),
          access.library.folders(),
        ]);
        const parents = new Map(folders.map((folder) => [folder.id, folder]));
        const results = result.items.map((file) => {
          const parts = [file.name];
          let current = file.folderId;
          while (current && current !== workspaceId) {
            const folder = parents.get(current);
            if (!folder) break;
            parts.unshift(folder.name);
            current = folder.parentId;
          }
          return {
            path: parts.join('/'),
            fileEntryId: file.entry.id,
            revision: file.entry.updatedAt,
            mediaType: file.entry.mediaType,
            size: file.entry.size,
          };
        });
        return { value: { files: results, nextCursor: result.nextCursor ?? null }, artifacts: [] };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: 'create_workspace_folder' },
      providerName: 'create_workspace_folder',
      displayName: 'Create workspace folder',
      approval: 'auto',
      description:
        'Create one folder at a relative workspace path. Its parent must exist. The Agent cannot move, delete, restore or purge library items.',
      inputSchema: toRuntimeInputSchema(createFolderSchema),
      async execute({ input }) {
        const parsed = createFolderSchema.parse(input);
        const segments = workspacePathSegments(parsed.path);
        const name = segments.pop();
        if (!name)
          return {
            value: { status: 'error', message: 'A new folder name is required.' },
            artifacts: [],
          };
        const parent = await access.library.resolveDirectory(workspaceId, segments.join('/'));
        await access.library.createFolder(parent.id, name, workspaceId);
        return { value: { status: 'created', path: [...segments, name].join('/') }, artifacts: [] };
      },
    },
  );
  return tools;
}
