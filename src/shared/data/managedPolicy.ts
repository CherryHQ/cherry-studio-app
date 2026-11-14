/**
 * What the user may change in the active profile. Data services enforce these rules at their write
 * boundaries and screens read the same ones, so neither side asks which edition is running.
 */
import { isEnterpriseProfile } from './activeProfile';
import { type Agent, MANAGED_AGENT_EDITABLE_FIELDS } from './types/agent';
import type { UniqueModelId } from './types/model';

/** Profile-wide settings, named as on the desktop (`useEnterpriseCapabilities`). */
export type EditionCapabilities = Readonly<{
  /** Add, configure, sign in to and remove model providers and their models. */
  providerSettings: boolean;
  /** Choose the default models. */
  modelSettings: boolean;
  /** First-use provider setup. */
  providerOnboarding: boolean;
  /** Import configuration from a paired desktop. */
  desktopConfigImport: boolean;
}>;

const COMMUNITY_CAPABILITIES: EditionCapabilities = Object.freeze({
  providerSettings: true,
  modelSettings: true,
  providerOnboarding: true,
  desktopConfigImport: true,
});

/** The organization supplies providers, models and default models. */
const ENTERPRISE_CAPABILITIES: EditionCapabilities = Object.freeze({
  providerSettings: false,
  modelSettings: false,
  providerOnboarding: false,
  desktopConfigImport: false,
});

export function editionCapabilities(): EditionCapabilities {
  return isEnterpriseProfile() ? ENTERPRISE_CAPABILITIES : COMMUNITY_CAPABILITIES;
}

/** What the user may do with one Agent, MCP server or Skill the organization may own. */
export type ResourcePolicy = Readonly<{
  /** Delivered by the organization. */
  managed: boolean;
  canEdit: (field: string) => boolean;
  canDelete: boolean;
  /** Change an Agent's Skill and tool bindings. */
  canBind: boolean;
  /** Show organization secrets: an Agent's instructions, an MCP server's headers. */
  revealsSecrets: boolean;
  /** The models the user may pick; null leaves every model open. */
  allowedModelIds: readonly UniqueModelId[] | null;
}>;

/** Everything the user may change: user-owned data, or no resource at all. */
export const OPEN_POLICY: ResourcePolicy = Object.freeze({
  managed: false,
  canEdit: () => true,
  canDelete: true,
  canBind: true,
  revealsSecrets: true,
  allowedModelIds: null,
});

/** Owned by the organization; nothing the user may change. */
const LOCKED: ResourcePolicy = Object.freeze({
  managed: true,
  canEdit: () => false,
  canDelete: false,
  canBind: false,
  revealsSecrets: false,
  allowedModelIds: null,
});

const NO_MODELS: readonly UniqueModelId[] = Object.freeze([]);

const agentPolicies = new WeakMap<object, ResourcePolicy>();

/**
 * A managed Agent keeps the user-adjustable fields; its model comes from the organization's pool
 * and is a choice only when the pool holds several. One record yields one policy object, so a
 * React scope holding it stays stable across renders.
 */
export function agentPolicy(
  agent: Pick<Agent, 'isManaged' | 'allowedModelIds'> | undefined,
): ResourcePolicy {
  if (!agent?.isManaged) return OPEN_POLICY;
  const cached = agentPolicies.get(agent);
  if (cached) return cached;
  const allowedModelIds = agent.allowedModelIds ?? NO_MODELS;
  const policy: ResourcePolicy = Object.freeze({
    ...LOCKED,
    canEdit: (field: string) =>
      field === 'model'
        ? allowedModelIds.length > 1
        : (MANAGED_AGENT_EDITABLE_FIELDS as readonly string[]).includes(field),
    allowedModelIds,
  });
  agentPolicies.set(agent, policy);
  return policy;
}

/** Delivered MCP servers and Skills are read-only. */
export function managedResourcePolicy(resource: object | undefined): ResourcePolicy {
  // Built-in MCP servers carry no ownership field at all.
  return (resource as { isManaged?: boolean } | undefined)?.isManaged ? LOCKED : OPEN_POLICY;
}

/** A profile-wide setting as a policy, for screens that only show what the organization owns. */
export function capabilityPolicy(capability: keyof EditionCapabilities): ResourcePolicy {
  return editionCapabilities()[capability] ? OPEN_POLICY : LOCKED;
}
