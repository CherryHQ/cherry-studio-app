/**
 * Environment admission for Skill packages.
 *
 * A profile lists what a workflow needs; the environment facts say what the
 * app, device, and Agent currently provide. The result is derived on every
 * read and carries reasons the UI can act on. Nothing here is persisted as a
 * compatibility boolean.
 */

import {
  canRequestDevicePermission,
  canUseDevicePermission,
  type DevicePermissionScope,
  type PermissionStatuses,
} from '@/shared/contracts/permissions';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import {
  BUILT_IN_TOOL_CAPABILITY_IDS,
  BUILT_IN_TOOL_DESCRIPTORS,
  type BuiltInToolCapabilityId,
} from '@/shared/data/types/builtInTool';
import type {
  SkillAdmission,
  SkillAdmissionReason,
  SkillExecutionRequirement,
  SkillPlatform,
  SkillProfile,
  SkillRequirements,
} from '@/shared/data/types/skill';
import type { WebSearchCapability } from '@/shared/data/types/webSearch';

import type { ValidatedSkillPackage } from './skillPackage';

/** Facts about the application environment, read from their owners per evaluation. */
export type SkillEnvironmentFacts = {
  platform: string;
  permissions: PermissionStatuses;
  webSearchAvailability: Readonly<Record<WebSearchCapability, boolean>>;
  hasPaintingModel: boolean;
  /** Connected plugin ids mapped to the tool names their bundled definition admits. */
  connectedPlugins: ReadonlyMap<string, ReadonlySet<string>>;
  pluginServerIds?: ReadonlyMap<string, ReadonlySet<string>>;
};

/** Facts about one Agent, added at binding time and turn preparation. */
export type SkillAgentFacts = {
  disabledCapabilities: readonly AgentCapability[];
  supportsToolCalling: boolean;
};

const BUILT_IN_TOOL_IDS = new Set<string>(BUILT_IN_TOOL_CAPABILITY_IDS);
const DESCRIPTORS_BY_ID = new Map(
  BUILT_IN_TOOL_DESCRIPTORS.map((descriptor) => [descriptor.capabilityId, descriptor] as const),
);

/**
 * Evaluates one profile against the current environment. Application-scope
 * checks run first; Agent-scope checks are added when `agent` is supplied.
 */
export function evaluateSkillAdmission(
  profile: SkillProfile,
  environment: SkillEnvironmentFacts,
  agent?: SkillAgentFacts,
): SkillAdmission {
  const reasons: SkillAdmissionReason[] = [];
  const { requirements } = profile;
  let unsupported = false;
  let setupRequired = false;

  if (
    requirements.platforms &&
    !requirements.platforms.includes(environment.platform as SkillPlatform)
  ) {
    reasons.push({ code: 'platform-unsupported', subject: environment.platform });
    unsupported = true;
  }
  if (requirements.execution !== 'none') {
    reasons.push({ code: 'execution-unsupported', subject: requirements.execution });
    unsupported = true;
  }

  for (const toolId of requirements.builtInTools) {
    const descriptor = DESCRIPTORS_BY_ID.get(toolId);
    if (!descriptor) {
      reasons.push({ code: 'capability-unavailable', subject: toolId });
      unsupported = true;
      continue;
    }
    if (descriptor.platforms && !descriptor.platforms.some((p) => p === environment.platform)) {
      reasons.push({ code: 'capability-unavailable', subject: toolId });
      unsupported = true;
      continue;
    }
    if (
      descriptor.requiresWebSearchCapability &&
      !environment.webSearchAvailability[descriptor.requiresWebSearchCapability]
    ) {
      reasons.push({ code: 'web-search-unconfigured', subject: toolId });
      setupRequired = true;
    }
    if (descriptor.requiresPaintingModel && !environment.hasPaintingModel) {
      reasons.push({ code: 'drawing-model-unconfigured', subject: toolId });
      setupRequired = true;
    }
    const blockedScope = findBlockedPermission(
      descriptor.permissionScopes,
      environment.permissions,
    );
    if (blockedScope) {
      reasons.push({ code: 'permission-denied', subject: blockedScope });
      setupRequired = true;
    }
    if (
      agent &&
      descriptor.agentCapability &&
      agent.disabledCapabilities.includes(descriptor.agentCapability)
    ) {
      reasons.push({ code: 'capability-disabled', subject: descriptor.agentCapability });
      setupRequired = true;
    }
  }

  for (const requirement of requirements.pluginTools) {
    const tools = environment.connectedPlugins.get(requirement.pluginId);
    if (!tools) {
      reasons.push({ code: 'plugin-not-connected', subject: requirement.pluginId });
      setupRequired = true;
      continue;
    }
    for (const tool of requirement.tools) {
      if (!tools.has(tool)) {
        reasons.push({
          code: 'plugin-tool-unavailable',
          subject: `${requirement.pluginId}:${tool}`,
        });
        unsupported = true;
      }
    }
  }

  if (agent && !agent.supportsToolCalling) {
    reasons.push({ code: 'model-tool-calling-unsupported', subject: null });
    setupRequired = true;
  }

  if (unsupported) return { status: 'unsupported', reasons };
  return { status: setupRequired ? 'setup-required' : 'ready', reasons };
}

/** A permission the OS can still request is supported with permission on use, not a blocker. */
function findBlockedPermission(
  scopes: readonly DevicePermissionScope[],
  permissions: PermissionStatuses,
): DevicePermissionScope | null {
  return (
    scopes.find(
      (scope) =>
        !canUseDevicePermission(scope, permissions[scope]) &&
        !canRequestDevicePermission(permissions[scope]),
    ) ?? null
  );
}

const SCRIPT_PATH = /^scripts\/|\.(?:py|sh|bash|zsh|js|mjs|ts|rb|ps1)$/i;

/**
 * Derives an `analyzed` profile from the package text. A package whose
 * instructions call its own bundled scripts needs an interpreter Cherry Mobile
 * does not provide. Other workflows are admitted; instructions that name an
 * unavailable command simply cannot be followed, and loading grants nothing.
 */
export function analyzeSkillRequirements(
  pkg: Pick<ValidatedSkillPackage, 'instructions' | 'manifest'>,
  pluginToolCatalog: ReadonlyMap<string, ReadonlySet<string>>,
): SkillProfile {
  const text = pkg.instructions;
  const scripts = pkg.manifest
    .map((entry) => entry.path)
    .filter(
      (path) =>
        SCRIPT_PATH.test(path) && (text.includes(path) || text.includes(path.split('/').pop()!)),
    );
  const execution: SkillExecutionRequirement =
    scripts.length === 0
      ? 'none'
      : scripts.some((path) => /\.py$/i.test(path))
        ? 'python'
        : scripts.some((path) => /\.(?:js|mjs|ts)$/i.test(path))
          ? 'node'
          : 'shell';

  const builtInTools = [...BUILT_IN_TOOL_IDS]
    .filter((id) => new RegExp(`\\b${id}\\b`).test(text))
    .sort() as BuiltInToolCapabilityId[];
  const pluginTools = [...pluginToolCatalog]
    .flatMap(([pluginId, tools]) => {
      const named = [...tools]
        .filter((tool) => new RegExp(`\\b${pluginId}\\s+${tool}\\b|\`${tool}\``).test(text))
        .sort();
      return named.length > 0 ? [{ pluginId, tools: named }] : [];
    })
    .sort((a, b) => (a.pluginId < b.pluginId ? -1 : 1));

  const requirements: SkillRequirements = {
    platforms: null,
    execution,
    builtInTools,
    pluginTools,
  };
  return {
    provenance: 'analyzed',
    requirements,
    workflowScope: null,
  };
}
