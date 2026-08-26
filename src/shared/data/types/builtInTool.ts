/**
 * The built-in tool catalog.
 *
 * One list, read by both sides: the Mobile Agent Host resolves it into the
 * per-turn `RuntimeTool[]` snapshot, and the Agent editor renders it as the
 * per-Agent tool switches. Keeping the descriptors here is what stops the two
 * from drifting into different opinions about which capabilities exist.
 *
 * A descriptor states only what is true everywhere. Whether a tool can actually
 * run this turn depends on OS permission, the configured drawing model, and the
 * Agent binding, and that resolution belongs to the Host.
 */

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

/** Groups the editor renders together; not a runtime concept. */
export type BuiltInToolGroup =
  | 'calendar'
  | 'files'
  | 'health'
  | 'location'
  | 'media'
  | 'reminders'
  | 'web';

export type BuiltInToolDescriptor = {
  capabilityId: BuiltInToolCapabilityId;
  /** Approval used when the Agent has no explicit binding for this capability. */
  defaultApproval: AgentToolApproval;
  group: BuiltInToolGroup;
  /**
   * Off until a binding turns it on. Reserved for capabilities that reach a
   * separately configured third-party service, which the retired per-Assistant
   * web-search switch used to gate.
   */
  isOptIn: boolean;
  /** OS permission scopes that must be granted before the tool is offered. */
  permissionScopes: readonly DevicePermissionScope[];
  /** `null` means every platform. */
  platforms: readonly ('android' | 'ios')[] | null;
  /** Needs a drawing model configured in Settings > Model. */
  requiresPaintingModel: boolean;
};

const DEFAULTS = {
  isOptIn: false,
  permissionScopes: [],
  platforms: null,
  requiresPaintingModel: false,
} as const;

function describe(
  capabilityId: BuiltInToolCapabilityId,
  group: BuiltInToolGroup,
  defaultApproval: AgentToolApproval,
  overrides: Partial<
    Omit<BuiltInToolDescriptor, 'capabilityId' | 'defaultApproval' | 'group'>
  > = {},
): BuiltInToolDescriptor {
  return { ...DEFAULTS, capabilityId, defaultApproval, group, ...overrides };
}

/**
 * Reads default to `auto` and mutations to `ask`: a wrong list query wastes a
 * turn, a wrong delete loses the user's data. `generate_image` asks because it
 * spends provider quota.
 */
export const BUILT_IN_TOOL_DESCRIPTORS: readonly BuiltInToolDescriptor[] = [
  describe('calendar_list_collections', 'calendar', 'auto', {
    permissionScopes: ['calendar.read'],
  }),
  describe('calendar_list_events', 'calendar', 'auto', { permissionScopes: ['calendar.read'] }),
  describe('calendar_create_event', 'calendar', 'ask', { permissionScopes: ['calendar.write'] }),
  describe('calendar_update_event', 'calendar', 'ask', {
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('calendar_delete_event', 'calendar', 'ask', {
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('reminder_list_collections', 'reminders', 'auto', {
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_list_items', 'reminders', 'auto', {
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_create_item', 'reminders', 'ask', {
    permissionScopes: ['reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_update_item', 'reminders', 'ask', {
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_delete_item', 'reminders', 'ask', {
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('health_get_summary', 'health', 'auto', { permissionScopes: ['health.read'] }),
  describe('health_list_workouts', 'health', 'auto', { permissionScopes: ['health.read'] }),
  describe('location_get_current', 'location', 'auto', { permissionScopes: ['location.read'] }),
  describe('web_search', 'web', 'auto', { isOptIn: true }),
  describe('web_fetch', 'web', 'auto', { isOptIn: true }),
  describe('generate_image', 'media', 'ask', { requiresPaintingModel: true }),
  describe('write_file', 'files', 'auto'),
];

const DESCRIPTORS_BY_ID = new Map<string, BuiltInToolDescriptor>(
  BUILT_IN_TOOL_DESCRIPTORS.map((descriptor) => [descriptor.capabilityId, descriptor]),
);

export function getBuiltInToolDescriptor(capabilityId: string): BuiltInToolDescriptor | undefined {
  return DESCRIPTORS_BY_ID.get(capabilityId);
}
