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

import { HEALTH_SUMMARY_METRICS } from '@/shared/contracts/health';
import {
  type DevicePermissionScope,
  HEALTH_PERMISSION_SCOPES,
} from '@/shared/contracts/permissions';
import { healthPermissionScope } from '@/shared/contracts/permissions';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import type { WebSearchCapability } from '@/shared/data/types/webSearch';

import type { AgentToolApproval } from './agentToolBinding';

export const BUILT_IN_TOOL_CAPABILITY_IDS = [
  'agent_create',
  'agent_get',
  'agent_list',
  'agent_set_avatar',
  'agent_update',
  'ask_user_question',
  'avatar_character_save',
  'calendar_create_event',
  'calendar_delete_event',
  'calendar_list_collections',
  'calendar_list_events',
  'calendar_update_event',
  'create_document',
  'create_presentation',
  'create_workbook',
  'edit_document',
  'edit_file',
  'edit_presentation',
  'edit_workbook',
  'list_workspace',
  'find_workspace_files',
  'create_workspace_folder',
  'library_search_files',
  'library_read_file',
  'library_list_folders',
  'library_move_item',
  'library_rename_item',
  'library_trash_item',
  'library_list_trash',
  'library_restore_item',
  'generate_image',
  'health_get_summary',
  'health_list_workouts',
  'health_list_data_types',
  'health_query_data',
  'health_get_record',
  'image_process',
  'inspect_office_file',
  'location_get_current',
  'read_file',
  'read_office_content',
  'run_office_script',
  'reminder_create_item',
  'reminder_delete_item',
  'reminder_list_collections',
  'reminder_list_items',
  'reminder_update_item',
  'run_js',
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
  /** OS scopes that must be usable or requestable before the tool is offered. */
  permissionScopes: readonly DevicePermissionScope[];
  /** Summaries can use independently authorized metrics; other tools require every scope. */
  permissionMatch?: 'any';
  /** `null` means every platform. */
  platforms: readonly ('android' | 'ios')[] | null;
  /** Needs a drawing model configured in Settings > Model. */
  requiresPaintingModel: boolean;
  /** Needs a default web search provider configured for this capability. */
  requiresWebSearchCapability?: WebSearchCapability;
  /** `read` marks a tool that changes nothing outside the conversation; absent is a write. */
  effect?: 'read';
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
  describe('agent_create', 'ask', { agentCapability: 'agents' }),
  describe('agent_get', 'auto', { agentCapability: 'agents', effect: 'read' }),
  describe('agent_list', 'auto', { agentCapability: 'agents', effect: 'read' }),
  describe('agent_set_avatar', 'ask', { agentCapability: 'agents' }),
  describe('agent_update', 'ask', { agentCapability: 'agents' }),
  describe('ask_user_question', 'auto'),
  describe('avatar_character_save', 'ask', { agentCapability: 'agents' }),
  describe('calendar_list_collections', 'auto', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read'],
    effect: 'read',
  }),
  describe('calendar_list_events', 'auto', {
    agentCapability: 'calendar',
    permissionScopes: ['calendar.read'],
    effect: 'read',
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
    effect: 'read',
  }),
  describe('reminder_list_items', 'auto', {
    agentCapability: 'reminders',
    permissionScopes: ['reminders.read'],
    platforms: ['ios'],
    effect: 'read',
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
  describe('health_get_summary', 'ask', {
    agentCapability: 'health',
    autoApprovalEligible: false,
    permissionScopes: HEALTH_SUMMARY_METRICS.map(healthPermissionScope),
    permissionMatch: 'any',
    platforms: ['ios'],
  }),
  describe('health_list_workouts', 'ask', {
    agentCapability: 'health',
    autoApprovalEligible: false,
    permissionScopes: ['health.workouts.read'],
    platforms: ['ios'],
  }),
  describe('health_list_data_types', 'auto', {
    agentCapability: 'health',
    platforms: ['ios'],
  }),
  ...(['health_query_data', 'health_get_record'] as const).map((id) =>
    describe(id, 'ask', {
      agentCapability: 'health',
      autoApprovalEligible: false,
      permissionScopes: HEALTH_PERMISSION_SCOPES,
      permissionMatch: 'any',
      platforms: ['ios'],
    }),
  ),
  describe('location_get_current', 'auto', {
    agentCapability: 'location',
    permissionScopes: ['location.read'],
    effect: 'read',
  }),
  describe('web_search', 'auto', {
    agentCapability: 'web',
    requiresWebSearchCapability: 'searchKeywords',
    effect: 'read',
  }),
  describe('web_fetch', 'auto', {
    agentCapability: 'web',
    requiresWebSearchCapability: 'fetchUrls',
    effect: 'read',
  }),
  describe('generate_image', 'ask', {
    agentCapability: 'image',
    autoApprovalEligible: false,
    requiresPaintingModel: true,
  }),
  describe('edit_file', 'auto'),
  describe('image_process', 'auto', { agentCapability: 'image' }),
  describe('inspect_office_file', 'auto', { effect: 'read' }),
  describe('read_office_content', 'auto', { effect: 'read' }),
  describe('edit_document', 'auto'),
  describe('edit_workbook', 'auto'),
  describe('edit_presentation', 'auto'),
  describe('create_document', 'auto'),
  describe('create_workbook', 'auto'),
  describe('create_presentation', 'auto'),
  describe('run_office_script', 'auto'),
  describe('list_workspace', 'auto', { effect: 'read' }),
  describe('find_workspace_files', 'auto', { effect: 'read' }),
  describe('create_workspace_folder', 'auto'),
  describe('library_search_files', 'auto', { agentCapability: 'fileLibrary', effect: 'read' }),
  describe('library_read_file', 'auto', { agentCapability: 'fileLibrary', effect: 'read' }),
  describe('library_list_folders', 'auto', { agentCapability: 'fileLibrary', effect: 'read' }),
  describe('library_move_item', 'ask', { agentCapability: 'fileLibrary' }),
  describe('library_rename_item', 'ask', { agentCapability: 'fileLibrary' }),
  describe('library_trash_item', 'ask', { agentCapability: 'fileLibrary' }),
  describe('library_list_trash', 'auto', { agentCapability: 'fileLibrary', effect: 'read' }),
  describe('library_restore_item', 'ask', { agentCapability: 'fileLibrary' }),
  describe('read_file', 'auto', { effect: 'read' }),
  describe('write_file', 'auto'),
  describe('run_js', 'auto'),
];

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
