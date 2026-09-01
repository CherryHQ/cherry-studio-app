/**
 * The built-in tool catalog.
 *
 * One list read by the Mobile Agent Host to resolve system capabilities into a
 * per-turn `RuntimeTool[]` snapshot.
 *
 * A descriptor states only what is true everywhere. Whether a tool can actually
 * run this turn depends on the Agent's capability-group deny-list, OS
 * permission, and application configuration.
 */

import type { DevicePermissionScope } from '@/shared/contracts/permissions';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import type { WebSearchCapability } from '@/shared/data/types/webSearch';

import type { AgentToolApproval } from './agentToolBinding';

export const BUILT_IN_TOOL_CAPABILITY_IDS = [
  'calendar_create_event',
  'calendar_delete_event',
  'calendar_list_collections',
  'calendar_list_events',
  'calendar_update_event',
  'edit_file',
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
  /**
   * The Agent-configurable capability group this tool belongs to. Omit for
   * core tools that every Agent turn gets.
   */
  agentCapability?: AgentCapability;
  /**
   * False keeps the Agent's global `auto` approval mode from promoting this
   * tool's `ask`: enabling a capability is not consent to spend or destroy.
   */
  autoApprovalEligible: boolean;
  /** OS permission scopes that must not be denied before the tool is offered. */
  permissionScopes: readonly DevicePermissionScope[];
  /** `null` means every platform. */
  platforms: readonly ('android' | 'ios')[] | null;
  /** Needs a drawing model configured in Settings > Model. */
  requiresPaintingModel: boolean;
  /** Needs a default web search provider configured for this capability. */
  requiresWebSearchCapability?: WebSearchCapability;
};

const DEFAULTS = {
  autoApprovalEligible: true,
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
 * spends provider quota, and stays `ask` even under the Agent's global auto
 * mode.
 */
export const BUILT_IN_TOOL_DESCRIPTORS: readonly BuiltInToolDescriptor[] = [
  describe('calendar_list_collections', 'auto', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read'],
  }),
  describe('calendar_list_events', 'auto', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read'],
  }),
  describe('calendar_create_event', 'ask', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.write'],
  }),
  describe('calendar_update_event', 'ask', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('calendar_delete_event', 'ask', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read', 'calendar.write'],
  }),
  describe('reminder_list_collections', 'auto', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_list_items', 'auto', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
  }),
  describe('reminder_create_item', 'ask', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_update_item', 'ask', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('reminder_delete_item', 'ask', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.read', 'reminders.write'],
    platforms: ['ios'],
  }),
  describe('health_get_summary', 'auto', {
    agentCapability: 'health',
    permissionScopes: ['health.read'],
  }),
  describe('health_list_workouts', 'auto', {
    agentCapability: 'health',
    permissionScopes: ['health.read'],
  }),
  describe('location_get_current', 'auto', {
    agentCapability: 'location',
    permissionScopes: ['location.read'],
  }),
  describe('web_search', 'auto', {
    agentCapability: 'web',
    requiresWebSearchCapability: 'searchKeywords',
  }),
  describe('web_fetch', 'auto', {
    agentCapability: 'web',
    requiresWebSearchCapability: 'fetchUrls',
  }),
  describe('generate_image', 'ask', {
    agentCapability: 'image',
    autoApprovalEligible: false,
    requiresPaintingModel: true,
  }),
  describe('edit_file', 'auto'),
  describe('write_file', 'auto'),
];

const DESCRIPTORS_BY_ID = new Map<string, BuiltInToolDescriptor>(
  BUILT_IN_TOOL_DESCRIPTORS.map((descriptor) => [descriptor.capabilityId, descriptor]),
);

export function getBuiltInToolDescriptor(capabilityId: string): BuiltInToolDescriptor | undefined {
  return DESCRIPTORS_BY_ID.get(capabilityId);
}

export type AgentCapabilityAvailability = {
  /** Union of the member tools' OS permission scopes; empty when none apply. */
  permissionScopes: readonly DevicePermissionScope[];
  /** `null` when any member tool runs on every platform. */
  platforms: readonly ('android' | 'ios')[] | null;
};

/**
 * Availability facts for one capability group, derived from its member tools.
 * The Agent editor uses this to drive permission requests and to hide groups
 * a platform cannot serve.
 */
export function getAgentCapabilityAvailability(
  capability: AgentCapability,
): AgentCapabilityAvailability {
  const members = BUILT_IN_TOOL_DESCRIPTORS.filter(
    (descriptor) => descriptor.agentCapability === capability,
  );
  const permissionScopes = [
    ...new Set(members.flatMap((descriptor) => descriptor.permissionScopes)),
  ];
  const platforms = members.some((descriptor) => descriptor.platforms === null)
    ? null
    : [...new Set(members.flatMap((descriptor) => descriptor.platforms ?? []))];
  return { permissionScopes, platforms };
}
