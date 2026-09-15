import * as z from 'zod';

import {
  defineFeishuApiTool,
  FeishuIdSchema,
  FeishuMillisecondsSchema,
  FeishuOpenIdSchema,
  FeishuPageShape,
} from './feishuApiTool';

const taskShape = {
  task_guid: FeishuIdSchema.describe(
    'Full task GUID from task_list, task_get or task_create; not the displayed task number such as t123.',
  ),
};
const taskTime = z.strictObject({ timestamp: FeishuMillisecondsSchema, is_all_day: z.boolean() });
const member = z.strictObject({ id: FeishuOpenIdSchema, role: z.enum(['assignee', 'follower']) });
const taskFields = {
  summary: z.string().min(1).max(3000),
  description: z.string().max(3000).optional(),
  start: taskTime.optional(),
  due: taskTime.optional(),
};
const validTimes = (input: {
  start?: z.infer<typeof taskTime> | null;
  due?: z.infer<typeof taskTime> | null;
}) =>
  !input.start ||
  !input.due ||
  (input.start.is_all_day === input.due.is_all_day &&
    Number(input.start.timestamp) <= Number(input.due.timestamp));
const taskPath = ({ task_guid }: { task_guid: string }) =>
  `/open-apis/task/v2/tasks/${encodeURIComponent(task_guid)}` as const;

export const feishuTaskTools = [
  defineFeishuApiTool({
    name: 'task_list',
    access: 'read',
    scopes: ['task:task:read'],
    description:
      '飞书任务、待办。List one page of tasks assigned to the authorized Feishu user (my_tasks), optionally filtered by completion. This is not all tasks created by or visible to the user. Continue with page_token while has_more is true.',
    input: z.strictObject({ ...FeishuPageShape, completed: z.boolean().optional() }),
    request: ({ page_size = 20, page_token, completed }) => ({
      method: 'GET',
      path: '/open-apis/task/v2/tasks',
      query: { page_size, page_token, completed, type: 'my_tasks', user_id_type: 'open_id' },
    }),
  }),
  defineFeishuApiTool({
    name: 'task_get',
    access: 'read',
    scopes: ['task:task:read'],
    description:
      '飞书任务、待办。Read a Feishu task by its GUID, including members, deadlines and completion state. Inspect it before updating or completing it.',
    input: z.strictObject(taskShape),
    request: (input) => ({
      method: 'GET',
      path: taskPath(input),
      query: { user_id_type: 'open_id' },
    }),
  }),
  defineFeishuApiTool({
    name: 'task_create',
    access: 'write',
    scopes: ['task:task:writeonly'],
    description:
      '飞书任务、待办。Create a Feishu task with explicit members. Use get-user or search-user for member open IDs, including yourself. Start and due timestamps use milliseconds and must use the same all-day setting. Creation may notify members.',
    input: z
      .strictObject({
        ...taskFields,
        members: z.array(member).min(1).max(50),
        client_token: z
          .string()
          .min(10)
          .max(100)
          .optional()
          .describe('Optional idempotency token; reuse only for the same intended creation.'),
      })
      .refine(
        validTimes,
        'Start must not be after due and both must use the same all-day setting.',
      ),
    request: ({ members, ...body }) => ({
      method: 'POST',
      path: '/open-apis/task/v2/tasks',
      query: { user_id_type: 'open_id' },
      body: { ...body, members: members.map((value) => ({ ...value, type: 'user' })) },
    }),
  }),
  defineFeishuApiTool({
    name: 'task_update',
    access: 'write',
    scopes: ['task:task:writeonly'],
    description:
      '飞书任务、待办。Update only supplied task fields. Null clears start or due; omitted fields stay unchanged. completed_at is a millisecond timestamp to complete the entire task (all assignees), or "0" to reopen it. Read task_get first; personal completion is not supported.',
    input: z.strictObject({
      ...taskShape,
      changes: z
        .strictObject({
          summary: taskFields.summary.optional(),
          description: taskFields.description,
          start: taskTime.nullable().optional(),
          due: taskTime.nullable().optional(),
          completed_at: FeishuMillisecondsSchema.optional(),
        })
        .refine((value) => Object.keys(value).length > 0, 'Supply at least one changed field.')
        .refine(validTimes),
    }),
    request: ({ task_guid, changes }) => ({
      method: 'PATCH',
      path: taskPath({ task_guid }),
      query: { user_id_type: 'open_id' },
      body: {
        task: Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null)),
        update_fields: Object.keys(changes),
      },
    }),
  }),
  defineFeishuApiTool({
    name: 'task_add_members',
    access: 'write',
    scopes: ['task:personnel:writeonly'],
    description:
      '飞书任务、待办。Add assignees or followers to an existing Feishu task using verified open IDs. Existing members are preserved; this may notify the added members.',
    input: z.strictObject({ ...taskShape, members: z.array(member).min(1).max(50) }),
    request: ({ task_guid, members }) => ({
      method: 'POST',
      path: `${taskPath({ task_guid })}/add_members`,
      query: { user_id_type: 'open_id' },
      body: { members: members.map((value) => ({ ...value, type: 'user' })) },
    }),
  }),
];
