import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import type { HttpQuery } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import { readGmailMessage, readGmailThread } from './gmailMessages';

type GmailRequest = { path: `/gmail/v1/users/me/${string}`; query?: HttpQuery };
export type GmailTool = {
  definition: ListToolsResult['tools'][number];
  request(input: Record<string, unknown>): GmailRequest;
  project(value: unknown): unknown;
};

function define<T>(
  name: string,
  description: string,
  input: z.ZodType<T>,
  request: (input: T) => GmailRequest,
  project: (value: unknown) => unknown = (value) => value,
): GmailTool {
  const { $schema: _schema, ...schema } = z.toJSONSchema(input, { target: 'draft-7' });
  return {
    definition: {
      name,
      description,
      inputSchema: { ...schema, type: 'object' },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    request(value) {
      const parsed = input.safeParse(value);
      if (!parsed.success)
        throw new PluginError('request', `Invalid arguments for Gmail tool ${name}.`);
      return request(parsed.data);
    },
    project,
  };
}

const IdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/);
const SearchSchema = z.strictObject({
  query: z
    .string()
    .max(2000)
    .optional()
    .describe('Gmail query, for example is:unread after:2026/09/01 from:person@example.com.'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Results per page; defaults to 20.'),
  pageToken: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe('nextPageToken from the preceding result.'),
  labelIds: z.array(IdSchema).max(20).optional(),
  includeSpamTrash: z.boolean().optional(),
});

function searchQuery(input: z.infer<typeof SearchSchema>): HttpQuery {
  return {
    q: input.query,
    maxResults: input.pageSize ?? 20,
    pageToken: input.pageToken,
    labelIds: input.labelIds,
    includeSpamTrash: input.includeSpamTrash ?? false,
  };
}

export const GMAIL_TOOLS = new Map(
  [
    define(
      'gmail_get_profile',
      'Get the connected Gmail account and mailbox totals. 获取 Gmail 账号与邮箱统计。',
      z.strictObject({}),
      () => ({ path: '/gmail/v1/users/me/profile' }),
    ),
    define(
      'gmail_search_messages',
      'Search Gmail messages. Returns IDs, pagination, and an estimated count; read messages before summarizing. 搜索邮件。',
      SearchSchema,
      (input) => ({ path: '/gmail/v1/users/me/messages', query: searchQuery(input) }),
    ),
    define(
      'gmail_get_message',
      'Read one Gmail message, decoded text, headers, labels and attachment metadata. Does not mark it read or download attachments. 阅读邮件正文。',
      z.strictObject({ messageId: IdSchema }),
      ({ messageId }) => ({
        path: `/gmail/v1/users/me/messages/${messageId}`,
        query: { format: 'full' },
      }),
      readGmailMessage,
    ),
    define(
      'gmail_search_threads',
      'Search Gmail threads using Gmail query syntax, preserving pagination. 搜索邮件会话。',
      SearchSchema,
      (input) => ({ path: '/gmail/v1/users/me/threads', query: searchQuery(input) }),
    ),
    define(
      'gmail_get_thread',
      'Read a Gmail conversation with decoded messages. Large bodies or threads are explicitly marked incomplete. 阅读邮件会话内容。',
      z.strictObject({ threadId: IdSchema }),
      ({ threadId }) => ({
        path: `/gmail/v1/users/me/threads/${threadId}`,
        query: { format: 'full' },
      }),
      readGmailThread,
    ),
    define(
      'gmail_list_labels',
      'List Gmail labels and IDs. Does not modify labels or messages. 查询邮件标签。',
      z.strictObject({}),
      () => ({ path: '/gmail/v1/users/me/labels' }),
    ),
  ].map((tool) => [tool.definition.name, tool]),
);

export const GMAIL_TOOL_POLICY = Object.fromEntries(
  [...GMAIL_TOOLS.keys()].map((name) => [name, 'read' as const]),
);
