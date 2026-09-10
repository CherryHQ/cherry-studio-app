import * as z from 'zod';

import { FEISHU_API_TOOLS } from '../feishuTools';

function request(name: string, input: Record<string, unknown>) {
  const tool = FEISHU_API_TOOLS.get(name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  // Exercise the serialized schema conversion used by the MCP runtime, as well as the
  // domain validator. A valid API argument must survive both layers unchanged.
  z.fromJSONSchema(JSON.parse(JSON.stringify(tool.definition.inputSchema))).parse(input);
  return tool.request(input);
}

it('admits explicit time-zone offsets through discovery and maps the free/busy range unchanged', () => {
  const input = {
    user_id: 'ou_cherry',
    time_min: '2026-09-10T10:00:00+08:00',
    time_max: '2026-09-10T12:00:00+08:00',
  };
  expect(request('calendar_get_freebusy', input)).toEqual({
    method: 'POST',
    path: '/open-apis/calendar/v4/freebusy/list',
    query: { user_id_type: 'open_id' },
    body: { ...input, only_busy: true },
  });
});

it('resolves a wiki requirement-table link before addressing the underlying Base', () => {
  expect(request('wiki_get_node', { token: 'XoQtwxy57isUtfkMjlVcvMVknIf' })).toEqual({
    method: 'GET',
    path: '/open-apis/wiki/v2/spaces/get_node',
    query: { token: 'XoQtwxy57isUtfkMjlVcvMVknIf' },
  });
  const input = {
    app_token: 'bascnResolved',
    table_id: 'tblRequirements',
    page_token: 'next-page',
    page_size: 20,
    field_names: ['需求', '状态'],
    filter: {
      conjunction: 'and',
      conditions: [{ field_name: '状态', operator: 'is', value: ['待处理'] }],
    },
  };
  expect(request('base_search_records', input)).toEqual({
    method: 'POST',
    path: '/open-apis/bitable/v1/apps/bascnResolved/tables/tblRequirements/records/search',
    query: { page_size: 20, page_token: 'next-page', user_id_type: 'open_id' },
    body: { field_names: input.field_names, filter: input.filter },
  });
});

it('updates only named Base fields and carries creation idempotency in the query', () => {
  const base = { app_token: 'bascnResolved', table_id: 'tblRequirements' };
  expect(
    request('base_update_record', { ...base, record_id: 'recOne', fields: { 状态: null } }),
  ).toMatchObject({
    method: 'PUT',
    path: '/open-apis/bitable/v1/apps/bascnResolved/tables/tblRequirements/records/recOne',
    body: { fields: { 状态: null } },
  });
  expect(
    request('base_create_record', {
      ...base,
      fields: { 需求: '新需求' },
      client_token: '00000000-0000-4000-8000-000000000001',
    }),
  ).toMatchObject({
    query: { client_token: '00000000-0000-4000-8000-000000000001', user_id_type: 'open_id' },
    body: { fields: { 需求: '新需求' } },
  });
});

it('uses task update_fields to distinguish clearing a date from preserving omitted fields', () => {
  expect(
    request('task_update', {
      task_guid: 'task-guid',
      changes: { summary: 'Follow up', due: null },
    }),
  ).toEqual({
    method: 'PATCH',
    path: '/open-apis/task/v2/tasks/task-guid',
    query: { user_id_type: 'open_id' },
    body: { task: { summary: 'Follow up' }, update_fields: ['summary', 'due'] },
  });
  expect(
    request('task_update', { task_guid: 'task-guid', changes: { completed_at: '0' } }),
  ).toMatchObject({
    body: { task: { completed_at: '0' }, update_fields: ['completed_at'] },
  });
});

it('lists assigned tasks and requires explicit open-ID members for creation', () => {
  expect(request('task_list', { completed: false })).toMatchObject({
    query: { type: 'my_tasks', completed: false, user_id_type: 'open_id', page_size: 20 },
  });
  expect(() => request('task_create', { summary: 'Follow up' })).toThrow();
  expect(
    request('task_create', {
      summary: 'Follow up',
      members: [{ id: 'ou_cherry', role: 'assignee' }],
    }),
  ).toMatchObject({
    body: { summary: 'Follow up', members: [{ id: 'ou_cherry', role: 'assignee', type: 'user' }] },
  });
});

it('preserves a calendar event when changing only its title and maps invitations separately', () => {
  const event = { calendar_id: 'feishu.cn_calendar@group.calendar.feishu.cn', event_id: 'event_0' };
  expect(
    request('calendar_update_event', { ...event, changes: { summary: 'New title' } }),
  ).toMatchObject({
    method: 'PATCH',
    body: { summary: 'New title' },
  });
  expect(
    request('calendar_add_attendees', {
      ...event,
      attendees: [{ user_id: 'ou_cherry' }],
      need_notification: false,
    }),
  ).toMatchObject({
    method: 'POST',
    query: { user_id_type: 'open_id' },
    body: { attendees: [{ user_id: 'ou_cherry', type: 'user' }], need_notification: false },
  });
});

it.each([
  ['base_search_records', { app_token: 'https://evil.test', table_id: 'tblOne' }],
  ['base_list_tables', { app_token: 'bascnOne', url: 'https://evil.test' }],
  [
    'base_update_record',
    { app_token: 'bascnOne', table_id: 'tblOne', record_id: 'recOne', fields: {} },
  ],
  ['task_update', { task_guid: 'task-guid', changes: {} }],
  [
    'task_create',
    {
      summary: 'Task',
      members: [{ id: 'ou_cherry', role: 'assignee' }],
      start: { timestamp: '2000', is_all_day: false },
      due: { timestamp: '1000', is_all_day: false },
    },
  ],
  ['calendar_list', { page_size: 20 }],
  [
    'calendar_list_events',
    { calendar_id: 'calOne', start_time: '1789048364000', end_time: '1789058364000' },
  ],
  [
    'calendar_list_events',
    { calendar_id: 'calOne', start_time: '1000', end_time: String(1000 + 40 * 86400) },
  ],
  [
    'calendar_update_event',
    { calendar_id: 'calOne', event_id: 'event_0', changes: { start_time: { date: '2026-09-10' } } },
  ],
  [
    'calendar_create_event',
    {
      calendar_id: 'calOne',
      summary: 'All day',
      start_time: { date: '2026-09-10' },
      end_time: { date: '2026-09-10' },
    },
  ],
  [
    'calendar_get_freebusy',
    { user_id: 'ou_cherry', time_min: '2026-09-10T10:00:00', time_max: '2026-09-10T12:00:00' },
  ],
])('rejects unsupported or unsafe %s arguments before sending a request', (name, input) => {
  expect(() => request(name as string, input as Record<string, unknown>)).toThrow();
});
