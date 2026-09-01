import * as z from 'zod';

/**
 * Agent-configurable capability groups.
 *
 * Enablement is group-level and stored on the Agent row as a deny-list
 * (`disabledCapabilities`, aligned with desktop's `disabledTools` pattern):
 * a capability absent from the list is enabled. Per-tool policy stays at the
 * approval layer; OS permission and service configuration remain separate
 * gates that resolve per turn.
 */
export const AGENT_CAPABILITIES = [
  'calendar',
  'health',
  'image',
  'location',
  'reminders',
  'web',
] as const;

export const AgentCapabilitySchema = z.enum(AGENT_CAPABILITIES);
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

/**
 * Editor prefill for a newly created Agent: sensitive device groups start
 * disabled and are opted in deliberately. This is form seeding only — storage
 * keeps whatever the editor saves, and an Agent row created without the editor
 * (empty deny-list) has every capability enabled.
 */
export const DEFAULT_DISABLED_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  'calendar',
  'health',
  'location',
  'reminders',
];

const KNOWN_CAPABILITIES = new Set<string>(AGENT_CAPABILITIES);

/**
 * Read-side guard for the persisted deny-list: a row written by another build
 * may hold ids this one does not know. Unknown ids are dropped rather than
 * surfaced, and remain in the stored JSON until the next save.
 */
export function sanitizeDisabledAgentCapabilities(value: unknown): AgentCapability[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<AgentCapability>();
  for (const entry of value) {
    if (typeof entry === 'string' && KNOWN_CAPABILITIES.has(entry)) {
      seen.add(entry as AgentCapability);
    }
  }
  return [...seen];
}
