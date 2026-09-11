import * as z from 'zod';

import {
  defineFeishuApiTool,
  FeishuIdSchema,
  FeishuOpenIdSchema,
  FeishuPageShape,
  FeishuSecondsSchema,
} from './feishuApiTool';

const calendarShape = {
  calendar_id: FeishuIdSchema.describe(
    'Actual calendar ID from calendar_get_primary or calendar_list; do not invent a "primary" ID.',
  ),
};
const eventShape = {
  ...calendarShape,
  event_id: FeishuIdSchema.describe('Event ID from calendar_list_events or calendar_create_event.'),
};
const time = z.union([
  z.strictObject({
    timestamp: FeishuSecondsSchema,
    timezone: z.string().min(1).max(100).describe('IANA time zone, for example Asia/Shanghai.'),
  }),
  z.strictObject({
    date: z.iso.date().describe('All-day date in YYYY-MM-DD. End date is exclusive.'),
  }),
]);
// The runtime's JSON-Schema converter treats date-time format as UTC-only. Preserve the
// official offset-aware validator as a pattern so both validation layers admit +08:00.
const offsetDateTime = z
  .string()
  .max(64)
  .regex(z.regexes.datetime({ offset: true }))
  .describe(
    'RFC 3339 date-time with an explicit offset or Z, for example 2026-09-10T10:00:00+08:00.',
  );
const eventFields = {
  summary: z.string().min(1).max(1000),
  description: z
    .string()
    .max(40_960)
    .optional()
    .describe(
      'Replacing the description replaces existing rich-text formatting; HTML is supported.',
    ),
  start_time: time,
  end_time: time,
  location: z
    .strictObject({
      name: z.string().min(1).max(512),
      address: z.string().min(1).max(255).optional(),
    })
    .optional(),
  need_notification: z
    .boolean()
    .optional()
    .describe(
      'Notify attendees; defaults to true on creation. Omit when updating to preserve the existing notification setting.',
    ),
};
function validEventTimes(input: {
  start_time?: z.infer<typeof time>;
  end_time?: z.infer<typeof time>;
}) {
  if (!input.start_time || !input.end_time) return !input.start_time && !input.end_time;
  const start = input.start_time;
  const end = input.end_time;
  if ('date' in start && 'date' in end) return start.date < end.date;
  return (
    'timestamp' in start && 'timestamp' in end && Number(start.timestamp) < Number(end.timestamp)
  );
}
const eventsPath = ({ calendar_id }: { calendar_id: string }) =>
  `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendar_id)}/events` as const;
const eventPath = (input: { calendar_id: string; event_id: string }) =>
  `${eventsPath(input)}/${encodeURIComponent(input.event_id)}` as const;

export const feishuCalendarTools = [
  defineFeishuApiTool({
    name: 'calendar_list',
    access: 'read',
    scopes: ['calendar:calendar:read'],
    description:
      '飞书日历、日程、忙闲、参会人。List one page of calendars accessible to the authorized Feishu user, including IDs, roles and calendar types. Continue with page_token while has_more is true. Third-party calendars are read-only.',
    input: z.strictObject({
      ...FeishuPageShape,
      page_size: z
        .number()
        .int()
        .min(50)
        .max(100)
        .optional()
        .describe('Page size, 50–100; default 50.'),
    }),
    request: ({ page_size = 50, page_token }) => ({
      method: 'GET',
      path: '/open-apis/calendar/v4/calendars',
      query: { page_size, page_token },
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_get_primary',
    access: 'read',
    scopes: ['calendar:calendar:read'],
    description:
      '飞书日历、日程、忙闲、参会人。Get the authorized Feishu user’s primary calendar and its actual calendar_id for subsequent event calls.',
    input: z.strictObject({}),
    request: () => ({
      method: 'POST',
      path: '/open-apis/calendar/v4/calendars/primary',
      query: { user_id_type: 'open_id' },
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_list_events',
    access: 'read',
    scopes: ['calendar:calendar.event:read'],
    description:
      '飞书日历、日程、忙闲、参会人。Query a Feishu calendar’s event instances in a time window shorter than 40 days, including occurrences of recurring events. Times are Unix seconds. Use narrower windows when results are large.',
    input: z
      .strictObject({
        ...calendarShape,
        start_time: FeishuSecondsSchema,
        end_time: FeishuSecondsSchema,
      })
      .refine(
        ({ start_time, end_time }) =>
          Number(end_time) > Number(start_time) &&
          Number(end_time) - Number(start_time) < 40 * 86400,
        'Use an increasing time window shorter than 40 days.',
      ),
    request: ({ calendar_id, start_time, end_time }) => ({
      method: 'GET',
      path: `${eventsPath({ calendar_id })}/instance_view`,
      query: { start_time, end_time, user_id_type: 'open_id' },
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_get_event',
    access: 'read',
    scopes: ['calendar:calendar.event:read'],
    description:
      '飞书日历、日程、忙闲、参会人。Read a Feishu event before changing its time, title or description. The event ID identifies either a series or a particular occurrence; preserve the intended ID.',
    input: z.strictObject(eventShape),
    request: (input) => ({
      method: 'GET',
      path: eventPath(input),
      query: { user_id_type: 'open_id' },
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_create_event',
    access: 'write',
    scopes: ['calendar:calendar.event:create'],
    description:
      '飞书日历、日程、忙闲、参会人。Create a Feishu event in the selected calendar. Supply matching start/end types; all-day end dates are exclusive. This creates the event only; invite people separately with calendar_add_attendees.',
    input: z
      .strictObject({
        ...calendarShape,
        ...eventFields,
        idempotency_key: z
          .string()
          .min(32)
          .max(128)
          .optional()
          .describe('Optional idempotency key; reuse only for the same intended creation.'),
      })
      .refine(validEventTimes, 'End must be after start; use matching date or timestamp types.'),
    request: ({ calendar_id, idempotency_key, ...body }) => ({
      method: 'POST',
      path: eventsPath({ calendar_id }),
      query: { user_id_type: 'open_id', idempotency_key },
      body,
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_update_event',
    access: 'write',
    scopes: ['calendar:calendar.event:update'],
    description:
      '飞书日历、日程、忙闲、参会人。Update only supplied event fields. When rescheduling, supply both start_time and end_time from the intended occurrence; omission preserves fields. Read calendar_get_event first. Omit need_notification to preserve the existing setting, or set it explicitly to control notifications.',
    input: z.strictObject({
      ...eventShape,
      changes: z
        .strictObject(eventFields)
        .partial()
        .refine(
          (value) => Object.keys(value).some((key) => key !== 'need_notification'),
          'Supply at least one event field.',
        )
        .refine(
          validEventTimes,
          'Supply both start and end with matching types and end after start.',
        ),
    }),
    request: ({ calendar_id, event_id, changes }) => ({
      method: 'PATCH',
      path: eventPath({ calendar_id, event_id }),
      query: { user_id_type: 'open_id' },
      body: changes,
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_get_freebusy',
    access: 'read',
    scopes: ['calendar:calendar.free_busy:read'],
    description:
      '飞书日历、日程、忙闲、参会人。Query one user’s primary-calendar busy intervals using their open ID. Time bounds must include an explicit UTC offset or Z and span at most 90 days. Other users’ availability remains subject to Feishu permissions.',
    input: z
      .strictObject({
        user_id: FeishuOpenIdSchema,
        time_min: offsetDateTime,
        time_max: offsetDateTime,
      })
      .refine(
        ({ time_min, time_max }) =>
          Date.parse(time_max) > Date.parse(time_min) &&
          Date.parse(time_max) - Date.parse(time_min) <= 90 * 86400_000,
        'Use an increasing time window of at most 90 days.',
      ),
    request: (body) => ({
      method: 'POST',
      path: '/open-apis/calendar/v4/freebusy/list',
      query: { user_id_type: 'open_id' },
      body: { ...body, only_busy: true },
    }),
  }),
  defineFeishuApiTool({
    name: 'calendar_add_attendees',
    access: 'write',
    scopes: ['calendar:calendar.event:update'],
    description:
      '飞书日历、日程、忙闲、参会人。Invite people to an existing Feishu event using verified open IDs. Existing attendees are preserved. This may send invitation notifications; rooms, groups and external email attendees are not supported by this tool.',
    input: z.strictObject({
      ...eventShape,
      attendees: z
        .array(z.strictObject({ user_id: FeishuOpenIdSchema, is_optional: z.boolean().optional() }))
        .min(1)
        .max(50),
      need_notification: z
        .boolean()
        .optional()
        .describe('Send invitation notifications; defaults to true.'),
    }),
    request: ({ calendar_id, event_id, attendees, need_notification }) => ({
      method: 'POST',
      path: `${eventPath({ calendar_id, event_id })}/attendees`,
      query: { user_id_type: 'open_id' },
      body: {
        attendees: attendees.map((attendee) => ({ ...attendee, type: 'user' })),
        need_notification,
      },
    }),
  }),
];
