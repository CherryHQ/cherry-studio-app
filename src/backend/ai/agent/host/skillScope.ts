/**
 * Per-turn Skill scope for the Mobile Agent Host.
 *
 * The scope is the intersection the design defines: installed accepted
 * packages ∩ globally enabled ∩ this Agent's enabled bindings ∩ current
 * environment and model eligibility. It pins each accepted revision; an
 * installation can append only its freshly checked revision during the turn.
 * It is the only thing the Skill tools can read.
 */

import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import type { ModelService } from '@/backend/data/services/ModelService';
import {
  decodeUtf8,
  evaluateSkillAdmission,
  parseSkillEntry,
  type SkillAgentFacts,
  type SkillEnvironmentReader,
  type SkillStorage,
} from '@/backend/services/skill';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import { createUniqueModelId } from '@/shared/data/types/model';
import type { SkillAdmission, SkillInvocation, SkillProfile } from '@/shared/data/types/skill';
import { sha256Hex } from '@/shared/utils/sha256';

import type { RuntimeModel, RuntimeTool } from '../runtime';

const logger = loggerService.withContext('SkillScope');

export type SkillTurnEntry = {
  id: string;
  name: string;
  description: string;
  invocation: SkillInvocation;
  /** The accepted revision pinned for this turn. */
  packageDigest: string;
  folderName: string;
  /** Package-relative paths, from the accepted manifest. */
  files: readonly string[];
  admission: SkillAdmission;
};

export type SkillTurnScope = {
  entries: readonly SkillTurnEntry[];
  /** Instruction body of one pinned entry; null when the package is unreadable. */
  readInstructions(skillId: string): Promise<string | null>;
  /** Raw bytes of one package-local file inside the pinned revision. */
  readFile(skillId: string, path: string): Promise<Uint8Array | null>;
};

export const EMPTY_SKILL_SCOPE: SkillTurnScope = Object.freeze({
  entries: Object.freeze([]),
  readInstructions: async () => null,
  readFile: async () => null,
});

export interface SkillScopeSource {
  check?(
    profile: SkillProfile,
    input: Parameters<SkillScopeSource['resolve']>[0],
  ): Promise<SkillAdmission>;
  resolve(input: {
    agentId: string;
    disabledCapabilities: readonly AgentCapability[];
    model: RuntimeModel;
    tools: readonly RuntimeTool[];
    signal: AbortSignal;
  }): Promise<SkillTurnScope>;
}

export type SkillScopeSourceDependencies = {
  skills: Pick<AgentGlobalSkillService, 'listUsableForAgent'>;
  storage: Pick<SkillStorage, 'hasRevision' | 'readFile'>;
  environment: Pick<SkillEnvironmentReader, 'read'>;
  models: Pick<ModelService, 'getById'>;
};

/** Only accepted, currently ready packages can enter a turn. */
export function isSkillUsable(admission: SkillAdmission): boolean {
  return admission.status === 'ready';
}

export function createSkillScopeSource(deps: SkillScopeSourceDependencies): SkillScopeSource {
  return {
    async check(profile, { disabledCapabilities, model, tools, signal }) {
      const [environment, configuredModel] = await Promise.all([
        deps.environment.read(),
        deps.models.getById(createUniqueModelId(model.providerId, model.modelId)),
      ]);
      signal.throwIfAborted();
      const admission = evaluateSkillAdmission(profile, profile.packageDigest, environment, {
        disabledCapabilities,
        supportsToolCalling:
          configuredModel?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ?? false,
      });
      if (admission.status !== 'ready') return admission;
      const builtIn = profile.requirements.builtInTools.find(
        (id) =>
          !tools.some(
            (tool) =>
              tool.approval !== 'deny' &&
              tool.ref.source === 'builtin' &&
              tool.ref.capabilityId === id,
          ),
      );
      if (builtIn)
        return {
          status: 'setup-required',
          reasons: [{ code: 'capability-unavailable', subject: builtIn }],
        };
      for (const { pluginId, tools: names } of profile.requirements.pluginTools) {
        const missing = names.find(
          (name) =>
            !tools.some(
              (tool) =>
                tool.approval !== 'deny' &&
                tool.ref.source === 'mcp' &&
                tool.ref.rawToolName === name &&
                environment.pluginServerIds?.get(pluginId)?.has(tool.ref.serverId),
            ),
        );
        if (missing)
          return {
            status: 'setup-required',
            reasons: [{ code: 'plugin-tool-unavailable', subject: `${pluginId}:${missing}` }],
          };
      }
      return admission;
    },
    async resolve({ agentId, disabledCapabilities, model, tools, signal }) {
      const projections = await deps.skills.listUsableForAgent(agentId);
      signal.throwIfAborted();
      if (projections.length === 0) return EMPTY_SKILL_SCOPE;
      const [environment, configuredModel] = await Promise.all([
        deps.environment.read(),
        deps.models.getById(createUniqueModelId(model.providerId, model.modelId)),
      ]);
      signal.throwIfAborted();
      const agent: SkillAgentFacts = {
        disabledCapabilities,
        supportsToolCalling:
          configuredModel?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ?? false,
      };
      const entries: SkillTurnEntry[] = [];
      for (const { skill } of projections) {
        const admission = evaluateSkillAdmission(
          skill.profile,
          skill.packageDigest,
          environment,
          agent,
        );
        if (!isSkillUsable(admission)) continue;
        const { builtInTools, pluginTools } = skill.profile.requirements;
        if (
          builtInTools.some(
            (id) =>
              !tools.some(
                (tool) =>
                  tool.approval !== 'deny' &&
                  tool.ref.source === 'builtin' &&
                  tool.ref.capabilityId === id,
              ),
          )
        )
          continue;
        if (
          pluginTools.some(({ pluginId, tools: required }) =>
            required.some(
              (name) =>
                !tools.some(
                  (tool) =>
                    tool.approval !== 'deny' &&
                    tool.ref.source === 'mcp' &&
                    tool.ref.rawToolName === name &&
                    environment.pluginServerIds?.get(pluginId)?.has(tool.ref.serverId),
                ),
            ),
          )
        )
          continue;
        const ref = { folderName: skill.folderName, packageDigest: skill.packageDigest };
        if (!deps.storage.hasRevision(ref)) {
          logger.warn('Installed Skill package is missing; excluding it from the turn', {
            skillId: skill.id,
          });
          continue;
        }
        entries.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          invocation: skill.invocation,
          packageDigest: skill.packageDigest,
          folderName: skill.folderName,
          files: skill.manifest.map((entry) => entry.path),
          admission,
        });
      }
      const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
      const manifests = new Map(
        projections.map(({ skill }) => [
          skill.id,
          new Map(skill.manifest.map((file) => [file.path, file.digest])),
        ]),
      );
      const refOf = (skillId: string) => {
        const entry = byId.get(skillId);
        return entry ? { folderName: entry.folderName, packageDigest: entry.packageDigest } : null;
      };
      async function readVerified(skillId: string, path: string) {
        const ref = refOf(skillId);
        const digest = manifests.get(skillId)?.get(path);
        if (!ref || !digest) return null;
        try {
          const bytes = await deps.storage.readFile(ref, path);
          return bytes && sha256Hex(bytes) === digest ? bytes : null;
        } catch {
          return null;
        }
      }
      return {
        entries: Object.freeze(entries),
        async readInstructions(skillId) {
          const ref = refOf(skillId);
          if (!ref) return null;
          const bytes = await readVerified(skillId, 'SKILL.md');
          const text = bytes ? decodeUtf8(bytes) : null;
          if (text === null) return null;
          const parsed = parseSkillEntry(text);
          return parsed && 'body' in parsed ? parsed.body.trim() : null;
        },
        async readFile(skillId, path) {
          return readVerified(skillId, path);
        },
      };
    },
  };
}

/** A successful install may append one rechecked revision; existing turn revisions never change. */
export function createExpandingSkillScope(initial: SkillTurnScope) {
  const entries = new Map(initial.entries.map((entry) => [entry.id, entry]));
  const readers = new Map(initial.entries.map((entry) => [entry.id, initial]));
  const scope: SkillTurnScope = {
    get entries() {
      return [...entries.values()];
    },
    readInstructions: (id) => readers.get(id)?.readInstructions(id) ?? Promise.resolve(null),
    readFile: (id, path) => readers.get(id)?.readFile(id, path) ?? Promise.resolve(null),
  };
  return {
    scope,
    include(checked: SkillTurnScope, skillId: string, digest: string) {
      const entry = checked.entries.find(
        (item) => item.id === skillId && item.packageDigest === digest,
      );
      if (
        !entry ||
        !isSkillUsable(entry.admission) ||
        (entries.has(skillId) && entries.get(skillId)!.packageDigest !== digest)
      )
        return false;
      entries.set(skillId, entry);
      readers.set(skillId, checked);
      return true;
    },
  };
}
