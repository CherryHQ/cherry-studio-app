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
 * `analyzed` profiles can only be `unsupported` or `unknown`: derived evidence
 * excludes a package, it never proves support.
 */
export function evaluateSkillAdmission(
  profile: SkillProfile,
  packageDigest: string,
  environment: SkillEnvironmentFacts,
  agent?: SkillAgentFacts,
): SkillAdmission {
  const reasons: SkillAdmissionReason[] = [];
  if (profile.packageDigest !== packageDigest) {
    return { status: 'unknown', reasons: [{ code: 'profile-digest-mismatch', subject: null }] };
  }
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
      descriptor.permissionMatch,
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
  if (profile.provenance === 'ai-assessed') {
    const assessment = profile.assessment;
    if (assessment?.decision === 'unsupported')
      return {
        status: 'unsupported',
        reasons: [{ code: 'ai-unsupported', subject: null }, ...reasons],
      };
    if (!assessment || assessment.decision !== 'supported' || assessment.uncertainties.length > 0)
      return { status: 'unknown', reasons: [{ code: 'ai-uncertain', subject: null }, ...reasons] };
  } else if (profile.provenance !== 'reviewed') {
    return { status: 'unknown', reasons: [{ code: 'unverified', subject: null }, ...reasons] };
  }
  return { status: setupRequired ? 'setup-required' : 'ready', reasons };
}

/** A permission the OS can still request is supported with permission on use, not a blocker. */
function findBlockedPermission(
  scopes: readonly DevicePermissionScope[],
  match: 'any' | undefined,
  permissions: PermissionStatuses,
): DevicePermissionScope | null {
  if (scopes.length === 0) return null;
  const usable = scopes.map(
    (scope) =>
      canUseDevicePermission(scope, permissions[scope]) ||
      canRequestDevicePermission(permissions[scope]),
  );
  if (match === 'any') {
    return usable.some(Boolean) ? null : scopes[0]!;
  }
  const blocked = usable.findIndex((value) => !value);
  return blocked === -1 ? null : scopes[blocked]!;
}

const EXECUTION_PATTERNS: readonly [RegExp, SkillExecutionRequirement][] = [
  [/\b(?:python3?|pip3?|uv run|pipx|jupyter)\b/i, 'python'],
  [/\b(?:npx|node|npm|pnpm|yarn|bun)\s+\S/i, 'node'],
  [/\b(?:bash|sh|zsh)\s+\S|^\s*\$ |\bchmod\b|\bcurl\b|\bgit clone\b/im, 'shell'],
  [/\b(?:libreoffice|soffice|ffmpeg|imagemagick|pandoc|pdftotext|tesseract)\b/i, 'binary'],
];

/**
 * Derives an `analyzed` profile from the package text. It detects the
 * evidence that excludes a mobile workflow (scripts, interpreters, CLI tools)
 * and the Cherry tool ids a package names explicitly. Finding nothing means
 * "nothing detected", which admission reports as unverified, not as ready.
 */
export function analyzeSkillRequirements(
  pkg: Pick<ValidatedSkillPackage, 'instructions' | 'manifest' | 'packageDigest' | 'frontmatter'>,
  pluginToolCatalog: ReadonlyMap<string, ReadonlySet<string>>,
): SkillProfile {
  const text = pkg.instructions;
  const scriptPaths = pkg.manifest
    .map((entry) => entry.path)
    .filter((path) => /^scripts\/|\.(?:py|sh|bash|zsh|js|mjs|ts|rb|ps1)$/i.test(path));
  let execution: SkillExecutionRequirement = 'none';
  const referencesScript = scriptPaths.some(
    (path) => text.includes(path) || text.includes(path.split('/').pop()!),
  );
  if (referencesScript) {
    execution = scriptPaths.some((path) => /\.py$/i.test(path))
      ? 'python'
      : scriptPaths.some((path) => /\.(?:js|mjs|ts)$/i.test(path))
        ? 'node'
        : 'shell';
  } else {
    const codeText = extractCode(text);
    for (const [pattern, requirement] of EXECUTION_PATTERNS) {
      if (pattern.test(codeText)) {
        execution = requirement;
        break;
      }
    }
  }

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
    packageDigest: pkg.packageDigest,
    provenance: 'analyzed',
    requirements,
    workflowScope: null,
  };
}

/** Fenced and inline code is where commands live; prose mentions of "python" are not requirements. */
function extractCode(markdown: string): string {
  const fenced = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]!);
  const inline = [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!);
  return [...fenced, ...inline].join('\n');
}
