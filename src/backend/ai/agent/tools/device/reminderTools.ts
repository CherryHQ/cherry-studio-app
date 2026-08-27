/**
 * iOS reminder capabilities. Android exposes no equivalent EventKit reminder
 * store, so the catalog omits these tools entirely off iOS rather than offering
 * a tool that always fails.
 */

import * as z from 'zod';

import {
  createReminderItem,
  deleteReminderItem,
  listReminderCollections,
  listReminderItems,
  type UpdateReminderDetails,
  updateReminderItem,
} from '@/backend/services/device';

import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';
import {
  DEFAULT_COLLECTION_LIMIT,
  EMPTY_INPUT_SCHEMA,
  entityId,
  isoDate,
  limit,
  optionalEntityId,
  optionalIsoDate,
  text,
} from './deviceToolSchemas';

export const REMINDER_TOOL_IDS = {
  createItem: 'reminder_create_item',
  deleteItem: 'reminder_delete_item',
  listCollections: 'reminder_list_collections',
  listItems: 'reminder_list_items',
  updateItem: 'reminder_update_item',
} as const;

const REMINDER_FIELDS = [
  'completed',
  'dueDate',
  'location',
  'notes',
  'startDate',
  'timeZone',
  'title',
] as const;

const listItemsSchema = z
  .object({
    endDate: isoDate,
    limit: limit(200),
    listIds: z.array(entityId).max(50),
    startDate: isoDate,
    status: z.enum(['all', 'completed', 'incomplete']),
  })
  .strict();

const createItemSchema = z
  .object({
    completed: z.boolean(),
    dueDate: optionalIsoDate,
    listId: optionalEntityId,
    location: text(1000),
    notes: text(4000),
    startDate: optionalIsoDate,
    timeZone: text(100),
    title: z.string().min(1).max(500),
  })
  .strict();

const updateItemSchema = z
  .object({
    completed: z.boolean(),
    dueDate: optionalIsoDate,
    fields: z.array(z.enum(REMINDER_FIELDS)).min(1).max(REMINDER_FIELDS.length),
    id: entityId,
    location: text(1000),
    notes: text(4000),
    startDate: optionalIsoDate,
    timeZone: text(100),
    title: text(500),
  })
  .strict();

const deleteItemSchema = z.object({ id: entityId }).strict();

export function createReminderTools(deps: DeviceToolDependencies) {
  return [
    createDeviceRuntimeTool({
      capabilityId: REMINDER_TOOL_IDS.listCollections,
      deps,
      description: 'List iOS reminder collections.',
      displayName: 'List reminder lists',
      inputSchema: EMPTY_INPUT_SCHEMA,
      permissionScopes: ['reminders.read'],
      run: () => listReminderCollections(),
    }),
    createDeviceRuntimeTool({
      capabilityId: REMINDER_TOOL_IDS.listItems,
      deps,
      description: 'List iOS reminders in an ISO 8601 range of at most 90 days.',
      displayName: 'List reminders',
      inputSchema: listItemsSchema,
      permissionScopes: ['reminders.read'],
      run: (input) =>
        listReminderItems({
          endDate: input.endDate,
          limit: input.limit || DEFAULT_COLLECTION_LIMIT,
          listIds: input.listIds.length > 0 ? input.listIds : undefined,
          startDate: input.startDate,
          status: input.status,
        }),
    }),
    createDeviceRuntimeTool({
      capabilityId: REMINDER_TOOL_IDS.createItem,
      deps,
      description: 'Create an item in a writable iOS reminder collection.',
      displayName: 'Create reminder',
      inputSchema: createItemSchema,
      permissionScopes: ['reminders.write'],
      run: (input) =>
        createReminderItem({
          completed: input.completed,
          dueDate: input.dueDate || undefined,
          listId: input.listId || undefined,
          location: input.location || undefined,
          notes: input.notes || undefined,
          startDate: input.startDate || undefined,
          timeZone: input.timeZone || undefined,
          title: input.title,
        }),
    }),
    createDeviceRuntimeTool({
      capabilityId: REMINDER_TOOL_IDS.updateItem,
      deps,
      description: 'Update selected fields of an existing iOS reminder.',
      displayName: 'Update reminder',
      inputSchema: updateItemSchema,
      permissionScopes: ['reminders.read', 'reminders.write'],
      run: (input) => updateReminderItem(toReminderUpdate(input)),
    }),
    createDeviceRuntimeTool({
      capabilityId: REMINDER_TOOL_IDS.deleteItem,
      deps,
      description: 'Delete an existing iOS reminder.',
      displayName: 'Delete reminder',
      inputSchema: deleteItemSchema,
      permissionScopes: ['reminders.read', 'reminders.write'],
      run: (input) => deleteReminderItem(input.id),
    }),
  ];
}

function toReminderUpdate(
  input: z.output<typeof updateItemSchema>,
): UpdateReminderDetails & { id: string } {
  const update: UpdateReminderDetails & { id: string } = { id: input.id };
  for (const field of input.fields) {
    if (field === 'completed') {
      update.completed = input.completed;
    } else if (field === 'title') {
      if (!input.title.trim()) {
        throw new Error('title cannot be empty when it is selected for update');
      }
      update.title = input.title;
    } else {
      update[field] = input[field] || null;
    }
  }
  return update;
}
