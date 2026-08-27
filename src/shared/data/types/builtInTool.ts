/**
 * The built-in tool catalog.
 *
 * One list read by the Mobile Agent Host to resolve system capabilities into a
 * per-turn `RuntimeTool[]` snapshot.
 *
 * A descriptor states only what is true everywhere. Whether a tool can actually
 * run this turn depends on OS permission, application configuration, and any
 * temporary composer activation declared below.
 */

import type { AgentTemporaryCapability } from '@/shared/contracts/agent';
import type { DevicePermissionScope } from '@/shared/contracts/permissions';

import type { AgentToolApproval } from './agentToolBinding';

export const BUILT_IN_TOOL_CAPABILITY_IDS = [
  'calendar_create_event',
  'calendar_delete_event',
  'calendar_list_collections',
  'calendar_list_events',
  'calendar_update_event',
  'generate_image',
  'health_get_summary',
  'health_list_workouts',
  'location_get_current',
  'reminder_create_item',
  'reminder_delete_item',
  'reminder_list_collections',
  'reminder_list_items',
  'reminder_update_item',
  'web_fetch',
  'web_search',
  'write_file',
] as const;

export type BuiltInToolCapabilityId = (typeof BUILT_IN_TOOL_CAPABILITY_IDS)[number];

export type BuiltInToolDescriptor = {
  capabilityId: BuiltInToolCapabilityId;
  /** Application-owned approval policy shared by every Agent. */
  defaultApproval: AgentToolApproval;
  /** OS permission scopes that must be granted before the tool is offered. */
  permissionScopes: readonly DevicePermissionScope[];
  /** `null` means every platform. */
  platforms: readonly ('android' | 'ios')[] | null;
  /** Needs a drawing model configured in Settings > Model. */
  requiresPaintingModel: boolean;
  /** Omit for system capabilities injected into every Agent turn. */
  temporaryCapability?: AgentTemporaryCapability;
};

const DEFAULTS = {
  permissionScopes: [],
  platforms: null,
  requiresPaintingModel: false,
} as const;

function describe(
  capabilityId: BuiltInToolCapabilityId,
  defaultApproval: AgentToolApproval,
  overrides: Partial<Omit<BuiltInToolDescriptor, 'capabilityId' | 'defaultApproval'>> = {},
): BuiltInToolDescriptor {
  return { ...DEFAULTS, capabilityId, defaultApproval, ...overrides };
}

/**
 * Reads default to `auto` and mutations to `ask`: a wrong list query wastes a
 * turn, a wrong delete loses the user's data. `generate_image` asks because it
 * spends provider quota.
 */
export const BUILT_IN_TOOL_DESCRIPTORS: readonly BuiltInToolDescriptor[] = [
  describe('calendar_list_collections', 'auto', {
    permissionScopes: ['calendar.read'],
  }),
  describe('calendar_list_events', 'auto', { permissionScopes: ['calendar.read'] }),
  describe('calendar_create_event', 'ask', { permissionScopes: ['calendar.write'] }),
  describe('calendar_update_event', 'ask', {
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('calendar_delete_event', 'ask', {
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('reminder_list_collections', 'auto', {
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_list_items', 'auto', {
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_create_item', 'ask', {
    permissionScopes: ['reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_update_item', 'ask', {
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_delete_item', 'ask', {
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('health_get_summary', 'auto', { permissionScopes: ['health.read'] }),
  describe('health_list_workouts', 'auto', { permissionScopes: ['health.read'] }),
  describe('location_get_current', 'auto', { permissionScopes: ['location.read'] }),
  describe('web_search', 'auto', { temporaryCapability: 'web-search' }),
  describe('web_fetch', 'auto', { temporaryCapability: 'web-search' }),
  describe('generate_image', 'ask', {
    requiresPaintingModel: true,
    temporaryCapability: 'image-generation',
  }),
  describe('write_file', 'auto'),
];

const DESCRIPTORS_BY_ID = new Map<string, BuiltInToolDescriptor>(
  BUILT_IN_TOOL_DESCRIPTORS.map((descriptor) => [descriptor.capabilityId, descriptor]),
);

export function getBuiltInToolDescriptor(capabilityId: string): BuiltInToolDescriptor | undefined {
  return DESCRIPTORS_BY_ID.get(capabilityId);
}
