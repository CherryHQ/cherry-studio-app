/**
 * Per-turn Skill scope for the Mobile Agent Host.
 *
 * The scope is the intersection the design defines: installed accepted
 * packages ∩ globally enabled ∩ this Agent's enabled bindings. Environment
 * diagnostics never prevent reading instructions. It pins each revision; an
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
import type { SkillAdmission, SkillInvocation } from '@/shared/data/types/skill';

import type { RuntimeModel, RuntimeTool } from '../runtime';

const logger = loggerService.withContext('SkillScope');

export type SkillTurnEntry = {
  id: string;
  name: string;
  description: string;
  invocation: SkillInvocation;
  /** The accepted revision pinned for this turn. */
  contentHash: string;
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

export function createSkillScopeSource(deps: SkillScopeSourceDependencies): SkillScopeSource {
  return {
    async resolve({ agentId, disabledCapabilities, model, signal }) {
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
        const admission = evaluateSkillAdmission(skill.profile, environment, agent);
        const ref = { folderName: skill.folderName, contentHash: skill.contentHash };
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
          contentHash: skill.contentHash,
          folderName: skill.folderName,
          files: skill.manifest.map((entry) => entry.path),
          admission,
        });
      }
      const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
      async function readPackageFile(skillId: string, path: string) {
        const entry = byId.get(skillId);
        if (!entry || !entry.files.includes(path)) return null;
        try {
          return await deps.storage.readFile(entry, path);
        } catch {
          return null;
        }
      }
      return {
        entries: Object.freeze(entries),
        async readInstructions(skillId) {
          const bytes = await readPackageFile(skillId, 'SKILL.md');
          const text = bytes ? decodeUtf8(bytes) : null;
          if (text === null) return null;
          const parsed = parseSkillEntry(text);
          if (!parsed || !('body' in parsed)) return null;
          const compatibility = parsed.frontmatter.compatibility;
          const reasons = byId.get(skillId)!.admission.reasons;
          return [
            typeof compatibility === 'string' && compatibility.trim()
              ? `Package environment requirements (not verified): ${compatibility.trim()}`
              : '',
            reasons.length
              ? `Known environment limitations: ${reasons.map(({ code, subject }) => (subject ? `${code} (${subject})` : code)).join(', ')}.`
              : '',
            parsed.body.trim(),
          ]
            .filter(Boolean)
            .join('\n\n');
        },
        async readFile(skillId, path) {
          return readPackageFile(skillId, path);
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
        (item) => item.id === skillId && item.contentHash === digest,
      );
      if (!entry || (entries.has(skillId) && entries.get(skillId)!.contentHash !== digest))
        return false;
      entries.set(skillId, entry);
      readers.set(skillId, checked);
      return true;
    },
  };
}
