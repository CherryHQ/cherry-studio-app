/**
 * Per-turn Skill scope for the Mobile Agent Host.
 *
 * The scope is the intersection the design defines: installed accepted
 * packages ∩ globally enabled ∩ this Agent's enabled bindings. App
 * limitations never prevent reading instructions. Reads use an accepted package
 * snapshot; installation can append an entry and consented adaptation can replace it.
 * It is the only thing the Skill tools can read.
 */

import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import {
  decodeUtf8,
  evaluateSkillLimitations,
  parseSkillEntry,
  type SkillStorage,
} from '@/backend/services/skill';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { SkillInvocation, SkillLimitations } from '@/shared/data/types/skill';

const logger = loggerService.withContext('SkillScope');

export type SkillTurnEntry = {
  id: string;
  name: string;
  description: string;
  invocation: SkillInvocation;
  /** Integrity identity of the currently accepted package snapshot. */
  contentHash: string;
  folderName: string;
  /** Package-relative paths, from the accepted manifest. */
  files: readonly string[];
  limitations: SkillLimitations;
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
  resolve(input: { agentId: string; signal: AbortSignal }): Promise<SkillTurnScope>;
}

export type SkillScopeSourceDependencies = {
  skills: Pick<AgentGlobalSkillService, 'listUsableForAgent'>;
  storage: Pick<SkillStorage, 'hasRevision' | 'readFile'>;
};

export function createSkillScopeSource(deps: SkillScopeSourceDependencies): SkillScopeSource {
  return {
    async resolve({ agentId, signal }) {
      const projections = await deps.skills.listUsableForAgent(agentId);
      signal.throwIfAborted();
      if (projections.length === 0) return EMPTY_SKILL_SCOPE;
      const entries: SkillTurnEntry[] = [];
      for (const { skill } of projections) {
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
          limitations: evaluateSkillLimitations(skill.profile),
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
          const { scripts, unavailableTools } = byId.get(skillId)!.limitations;
          return [
            typeof compatibility === 'string' && compatibility.trim()
              ? `Package environment requirements (not verified): ${compatibility.trim()}`
              : '',
            scripts.length
              ? `This app cannot run the package's scripts: ${scripts.join(', ')}. They can only be read.`
              : '',
            unavailableTools.length
              ? `The package declares tools this app does not provide: ${unavailableTools.join(', ')}.`
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

/** Only installation may append entries; consented adaptation may replace an existing entry. */
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
  function include(checked: SkillTurnScope, skillId: string, digest: string, replace = false) {
    const entry = checked.entries.find(
      (item) => item.id === skillId && item.contentHash === digest,
    );
    if (
      !entry ||
      (!replace && entries.has(skillId) && entries.get(skillId)!.contentHash !== digest)
    )
      return false;
    if (replace && !entries.has(skillId)) return false;
    entries.set(skillId, entry);
    readers.set(skillId, checked);
    return true;
  }
  return {
    scope,
    include(checked: SkillTurnScope, skillId: string, digest: string) {
      return include(checked, skillId, digest);
    },
    replace: (checked: SkillTurnScope, skillId: string, digest: string) =>
      include(checked, skillId, digest, true),
  };
}
