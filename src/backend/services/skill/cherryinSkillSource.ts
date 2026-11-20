import { SkillsError } from '@/shared/contracts/skills';
import { SkillNameSchema } from '@/shared/data/types/skill';
import {
  cherryinSkillLocator,
  cherryinSkillUrl,
  parseCherryinSkillUrl,
} from '@/shared/utils/cherryinSkills';
import { sha256Hex } from '@/shared/utils/sha256';

import type { CherryinSkillClient } from './cherryinSkillClient';
import { readSkillArchive, SKILL_ARCHIVE_MAX_BYTES } from './skillArchive';
import { decodeUtf8, parseSkillEntry } from './skillPackage';
import type { SkillSourceAdapter, SkillSourceCandidate } from './skillSources';

export function createCherryinSkillSource(marketplace: CherryinSkillClient): SkillSourceAdapter & {
  resolveUrl(url: string, signal?: AbortSignal): Promise<SkillSourceCandidate[]>;
} {
  async function resolveUrl(raw: string, signal?: AbortSignal): Promise<SkillSourceCandidate[]> {
    const location = parseCherryinSkillUrl(raw);
    if (!location) throw new SkillsError('source-invalid', 'Provide a CherryIN Skill URL.');
    const detail = await marketplace.detail(location.id, signal);
    if (!detail.hasPackage) throw new SkillsError('not-found', 'This Skill has no package.');
    if ((detail.packageSize ?? 0) > SKILL_ARCHIVE_MAX_BYTES)
      throw new SkillsError('package-too-large', 'The Skill archive exceeds 32 MiB.');
    let archive: Uint8Array;
    try {
      const response = await marketplace.client.request<ArrayBuffer>({
        method: 'GET',
        path: `/api/skills/${encodeURIComponent(location.id)}/download`,
        credentials: 'omit',
        responseType: 'arraybuffer',
        signal,
        timeoutMs: 60_000,
        maxResponseBytes: SKILL_ARCHIVE_MAX_BYTES,
      });
      archive = new Uint8Array(response.data);
    } catch (error) {
      signal?.throwIfAborted();
      throw new SkillsError('source-unreachable', 'The CherryIN package could not be downloaded.', {
        cause: error,
      });
    }
    const files = await readSkillArchive(archive, signal);
    const entries = [...files.keys()].filter((path) => path.split('/').pop() === 'SKILL.md').sort();
    if (!entries.length) throw new SkillsError('package-invalid', 'The package has no SKILL.md.');
    if (entries.length > 256)
      throw new SkillsError(
        'package-too-large',
        'Choose a smaller collection or a specific GitHub Skill directory.',
      );
    const common = entries[0]!.split('/').slice(0, -1);
    while (common.length && !entries.every((path) => path.startsWith(`${common.join('/')}/`)))
      common.pop();
    const wrapper = common.length ? `${common.join('/')}/` : '';
    const revision = sha256Hex(archive);
    const candidates = entries.map((path): SkillSourceCandidate => {
      const root = path.slice(0, -'SKILL.md'.length);
      const entryPath = path.slice(wrapper.length);
      const text = decodeUtf8(files.get(path)!);
      const parsed = text === null ? null : parseSkillEntry(text);
      const metadata = parsed && 'frontmatter' in parsed ? parsed.frontmatter : {};
      const declaredName = SkillNameSchema.safeParse(metadata.name);
      const fallback = root
        .slice(0, -1)
        .split('/')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64)
        .replace(/-$/, '');
      const name = declaredName.success ? declaredName.data : fallback || 'invalid-skill';
      return {
        candidateId: `cherryin:${encodeURIComponent(location.id)}:${revision}:${entryPath}`,
        name,
        description:
          (typeof metadata.description === 'string' ? metadata.description.trim() : '') ||
          detail.description.en ||
          name,
        author: detail.author,
        version: detail.version,
        tags: detail.tags,
        source: {
          registry: 'cherryin',
          locator: cherryinSkillLocator(location.id, entryPath),
          url: cherryinSkillUrl(location.id, entryPath),
          revision,
        },
        acquisition: {
          expectedName: name,
          files: new Map(
            [...files]
              .filter(([name]) => name.startsWith(root))
              .map(([name, bytes]) => [name.slice(root.length), bytes]),
          ),
        },
      };
    });
    const selected = location.entryPath
      ? candidates.filter(
          (candidate) =>
            parseCherryinSkillUrl(candidate.source.url!)?.entryPath === location.entryPath,
        )
      : candidates;
    if (!selected.length)
      throw new SkillsError('not-found', 'This collection member no longer exists.');
    return selected;
  }

  return {
    registry: 'cherryin',
    resolveUrl,
    async resolve(locator, signal) {
      const match = /^cherryin:([^/]+)\/(.+)$/.exec(locator);
      if (!match) throw new SkillsError('source-invalid', 'Invalid CherryIN locator.');
      return (
        await resolveUrl(cherryinSkillUrl(decodeURIComponent(match[1]!), match[2]!), signal)
      )[0]!;
    },
    async acquire(candidate, signal) {
      signal?.throwIfAborted();
      if (!candidate.acquisition)
        throw new SkillsError('candidate-expired', 'Resolve the CherryIN package again.');
      return candidate.acquisition;
    },
  };
}
