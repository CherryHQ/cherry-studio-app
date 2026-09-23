import * as z from 'zod';

import { createHttpClient, type HttpClient } from '@/backend/services/http';
import { SkillsError } from '@/shared/contracts/skills';
import { sha256Hex } from '@/shared/utils/sha256';

import {
  isSafePackagePath,
  SKILL_FILE_MAX_BYTES,
  SKILL_PACKAGE_MAX_BYTES,
  SKILL_PACKAGE_MAX_FILES,
} from './skillPackage';
import type { SkillSourceAdapter, SkillSourceCandidate } from './skillSources';

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const detailSchema = z.object({
  skill: z.object({ slug: identity, displayName: z.string(), summary: z.string().nullish() }),
  owner: z.object({ handle: identity }),
  latestVersion: z.object({ version: z.string().min(1) }),
  moderation: z.object({ isMalwareBlocked: z.boolean().optional() }).nullish(),
});
const versionSchema = z.object({
  skill: z.object({ slug: identity }),
  version: z.object({
    version: z.string(),
    files: z
      .array(
        z.object({
          path: z.string(),
          size: z.int().nonnegative(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      )
      .min(1)
      .max(SKILL_PACKAGE_MAX_FILES),
  }),
});

/** Versioned public files avoid unbounded ZIP extraction and never execute a package. */
export function createClawhubSkillSource(
  client: HttpClient = createHttpClient({ baseUrl: 'https://clawhub.ai', timeoutMs: 20_000 }),
): SkillSourceAdapter {
  async function detail(owner: string, slug: string, signal?: AbortSignal) {
    const { data } = await client.request<unknown>({
      method: 'GET',
      path: `/api/v1/skills/${encodeURIComponent(slug)}`,
      signal,
      maxResponseBytes: 256 * 1024,
    });
    const parsed = detailSchema.parse(data);
    if (
      parsed.owner.handle.toLowerCase() !== owner.toLowerCase() ||
      parsed.skill.slug !== slug ||
      parsed.moderation?.isMalwareBlocked
    )
      throw new SkillsError('source-invalid', 'The ClawHub publisher or availability has changed.');
    return parsed;
  }
  function location(locator: string) {
    const match = /^clawhub:([^/]+)\/([^/]+)$/.exec(locator);
    if (!match || !identity.safeParse(match[1]).success || !identity.safeParse(match[2]).success)
      throw new SkillsError('source-invalid', 'Invalid ClawHub Skill location.');
    return { owner: match[1]!, slug: match[2]! };
  }
  return {
    registry: 'clawhub',
    async resolve(locator, signal): Promise<SkillSourceCandidate> {
      const { owner, slug } = location(locator);
      const value = await detail(owner, slug, signal);
      const revision = value.latestVersion.version;
      return {
        candidateId: `${locator}@${revision}`,
        name: slug,
        description: value.skill.summary ?? value.skill.displayName,
        author: owner,
        version: revision,
        tags: [],
        reviewed: null,
        source: {
          registry: 'clawhub',
          locator,
          revision,
          url: `https://clawhub.ai/${owner}/skills/${slug}`,
        },
      };
    },
    async acquire(candidate, signal) {
      const { owner, slug } = location(candidate.source.locator);
      await detail(owner, slug, signal);
      const base = `/api/v1/skills/${encodeURIComponent(slug)}`;
      const { data } = await client.request<unknown>({
        method: 'GET',
        path: `${base}/versions/${encodeURIComponent(candidate.source.revision)}`,
        signal,
        maxResponseBytes: 512 * 1024,
      });
      const value = versionSchema.parse(data);
      if (value.skill.slug !== slug || value.version.version !== candidate.source.revision)
        throw new SkillsError('source-invalid', 'ClawHub returned a different Skill version.');
      const files = new Map<string, Uint8Array>();
      let total = 0;
      for (const file of value.version.files) {
        total += file.size;
        if (!isSafePackagePath(file.path) || files.has(file.path))
          throw new SkillsError('package-invalid', 'Invalid or duplicate package path.');
        if (file.size > SKILL_FILE_MAX_BYTES || total > SKILL_PACKAGE_MAX_BYTES)
          throw new SkillsError('package-too-large', 'The Skill package exceeds the size limit.');
        const response = await client.request<ArrayBuffer>({
          method: 'GET',
          path: `${base}/file`,
          query: { path: file.path, version: candidate.source.revision },
          responseType: 'arraybuffer',
          signal,
          maxResponseBytes: SKILL_FILE_MAX_BYTES,
        });
        const bytes = new Uint8Array(response.data);
        if (bytes.byteLength !== file.size || sha256Hex(bytes) !== file.sha256)
          throw new SkillsError(
            'package-invalid',
            'ClawHub file content does not match its version manifest.',
          );
        files.set(file.path, bytes);
      }
      return { files, expectedName: slug };
    },
  };
}
