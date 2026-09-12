import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

export type SlackTool = {
  definition: ListToolsResult['tools'][number];
  request(input: Record<string, unknown>): { method: string; fields: Record<string, string> };
};
function define<T>(
  name: string,
  method: string,
  description: string,
  input: z.ZodType<T>,
  fields: (input: T) => Record<string, string>,
): SlackTool {
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
        throw new PluginError('request', `Invalid arguments for Slack tool ${name}.`);
      return { method, fields: fields(parsed.data) };
    },
  };
}
const IdSchema = z
  .string()
  .max(128)
  .regex(/^[A-Z][A-Z0-9]+$/);
const TimestampSchema = z
  .string()
  .max(32)
  .regex(/^\d{1,16}(\.\d{1,6})?$/);
const CursorSchema = z.string().min(1).max(4096).optional();
const HistorySchema = z.strictObject({
  channel: IdSchema,
  cursor: CursorSchema,
  oldest: TimestampSchema.optional(),
  latest: TimestampSchema.optional(),
  limit: z.number().int().min(1).max(15).optional(),
});
function historyFields(input: z.infer<typeof HistorySchema>) {
  return {
    channel: input.channel,
    limit: String(input.limit ?? 15),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.oldest ? { oldest: input.oldest } : {}),
    ...(input.latest ? { latest: input.latest } : {}),
  };
}
export const SLACK_TOOLS = new Map(
  [
    define(
      'slack_get_identity',
      'auth.test',
      'Identify the connected Slack workspace and user. 获取 Slack 工作区和账号。',
      z.strictObject({}),
      () => ({}),
    ),
    define(
      'slack_search_messages',
      'search.messages',
      'Search visible Slack messages with in:, from:, before: and after: syntax. Preserve message permalinks and pagination. 搜索可见消息。',
      z.strictObject({
        query: z.string().min(1).max(2000),
        page: z.number().int().min(1).max(100).optional(),
        count: z.number().int().min(1).max(100).optional(),
        sort: z.enum(['score', 'timestamp']).optional(),
        sortDirection: z.enum(['asc', 'desc']).optional(),
      }),
      (input) => ({
        query: input.query,
        page: String(input.page ?? 1),
        count: String(input.count ?? 20),
        sort: input.sort ?? 'timestamp',
        sort_dir: input.sortDirection ?? 'desc',
        highlight: 'false',
      }),
    ),
    define(
      'slack_list_conversations',
      'conversations.list',
      'List visible channels and conversations. Private conversations require membership and granted scopes. 查询可见频道和会话。',
      z.strictObject({
        types: z
          .array(z.enum(['public_channel', 'private_channel', 'im', 'mpim']))
          .min(1)
          .max(4)
          .optional(),
        cursor: CursorSchema,
        limit: z.number().int().min(1).max(100).optional(),
      }),
      (input) => ({
        types: (input.types ?? ['public_channel', 'private_channel']).join(','),
        limit: String(input.limit ?? 50),
        exclude_archived: 'true',
        ...(input.cursor ? { cursor: input.cursor } : {}),
      }),
    ),
    define(
      'slack_get_history',
      'conversations.history',
      'Read a page of conversation messages. Check has_more and response_metadata.next_cursor; access depends on membership and plan retention. 阅读频道消息。',
      HistorySchema,
      historyFields,
    ),
    define(
      'slack_get_thread',
      'conversations.replies',
      'Read the parent and replies of a Slack thread. ts is the parent timestamp, not a reply timestamp. 阅读消息线程。',
      HistorySchema.extend({ ts: TimestampSchema }),
      (input) => ({ ...historyFields(input), ts: input.ts }),
    ),
    define(
      'slack_get_message_link',
      'chat.getPermalink',
      'Get the original Slack link for a message timestamp. This method does not send messages. 获取原消息链接。',
      z.strictObject({ channel: IdSchema, messageTs: TimestampSchema }),
      (input) => ({ channel: input.channel, message_ts: input.messageTs }),
    ),
    define(
      'slack_get_user',
      'users.info',
      'Resolve a Slack user ID into their visible profile. Does not request email permissions. 查询成员信息。',
      z.strictObject({ user: IdSchema }),
      (input) => ({ user: input.user }),
    ),
  ].map((tool) => [tool.definition.name, tool]),
);
export const SLACK_TOOL_POLICY = Object.fromEntries(
  [...SLACK_TOOLS.keys()].map((name) => [name, 'read' as const]),
);
