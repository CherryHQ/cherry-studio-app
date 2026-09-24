/**
 * Discovery sources. Each source resolves a candidate to an exact revision
 * and downloads its complete file set; nothing here validates, admits, or
 * installs. Candidates are opaque handles the module re-resolves on demand.
 */

import { createHttpClient, type HttpClient, isHttpError } from '@/backend/services/http';
import { SkillsError } from '@/shared/contracts/skills';
import type { SkillSource } from '@/shared/data/types/skill';

import { BUNDLED_SKILLS, bundledSkillLocator, type BundledSkillDefinition } from './bundled';
import {
  SKILL_FILE_MAX_BYTES,
  SKILL_PACKAGE_MAX_BYTES,
  SKILL_PACKAGE_MAX_FILES,
  type SkillPackageFiles,
} from './skillPackage';

export type SkillSourceCandidate = {
  candidateId: string;
  name: string;
  description: string;
  author: string | null;
  version: string | null;
  tags: string[];
  source: SkillSource;
  reviewed: BundledSkillDefinition | null;
};

export type SkillAcquisition = {
  files: SkillPackageFiles;
  /** Expected package name from the source (the containing directory). */
  expectedName: string;
};

export interface SkillSourceAdapter {
  readonly registry: SkillSource['registry'];
  /** Re-resolves a locator to its current exact revision. */
  resolve(locator: string, signal?: AbortSignal): Promise<SkillSourceCandidate>;
  acquire(candidate: SkillSourceCandidate, signal?: AbortSignal): Promise<SkillAcquisition>;
}

const encoder = new TextEncoder();

export function createBundledSkillSource(
  definitions: readonly BundledSkillDefinition[] = BUNDLED_SKILLS,
): SkillSourceAdapter & { list(): SkillSourceCandidate[] } {
  const toCandidate = (definition: BundledSkillDefinition): SkillSourceCandidate => {
    const entry = definition.files['SKILL.md'] ?? '';
    const description =
      /^description:\s*(.+)$/m.exec(entry)?.[1]?.trim() ?? definition.workflowScope;
    return {
      candidateId: `bundled:${definition.name}@${definition.revision}`,
      name: definition.name,
      description,
      author: 'Cherry Studio',
      version: String(definition.revision),
      tags: [],
      source: {
        registry: 'bundled',
        locator: bundledSkillLocator(definition.name),
        url: null,
        revision: String(definition.revision),
      },
      reviewed: definition,
    };
  };
  const byLocator = new Map(definitions.map((d) => [bundledSkillLocator(d.name), d] as const));
  return {
    registry: 'bundled',
    list: () => definitions.map(toCandidate),
    async resolve(locator) {
      const definition = byLocator.get(locator);
      if (!definition) throw new SkillsError('not-found', `Unknown bundled Skill: ${locator}`);
      return toCandidate(definition);
    },
    async acquire(candidate) {
      const definition = byLocator.get(candidate.source.locator);
      if (!definition)
        throw new SkillsError('not-found', `Unknown bundled Skill: ${candidate.source.locator}`);
      return {
        expectedName: definition.name,
        files: new Map(
          Object.entries(definition.files).map(([path, text]) => [path, encoder.encode(text)]),
        ),
      };
    },
  };
}

/** Exact `SKILL.md` file URL on github.com; the containing directory is the Skill root. */
const GITHUB_SKILL_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/blob\/([^/]+)\/((?:[^/]+\/)*)SKILL\.md$/;

export type GithubSkillLocation = { owner: string; repo: string; ref: string; directory: string };

export function parseGithubSkillUrl(url: string): GithubSkillLocation | null {
  const match = GITHUB_SKILL_URL.exec(url.trim());
  if (!match) return null;
  const directory = match[4]!.replace(/\/$/, '');
  if (directory.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  try {
    return { owner: match[1]!, repo: match[2]!, ref: decodeURIComponent(match[3]!), directory };
  } catch {
    return null;
  }
}

export function githubSkillLocator(
  location: Pick<GithubSkillLocation, 'owner' | 'repo' | 'directory'>,
): string {
  return `github:${location.owner}/${location.repo}/${location.directory}`;
}

function parseGithubLocator(locator: string): Omit<GithubSkillLocation, 'ref'> | null {
  const match = /^github:([^/]+)\/([^/]+)\/(.*)$/.exec(locator);
  return match ? { owner: match[1]!, repo: match[2]!, directory: match[3]! } : null;
}

type GithubTreeEntry = {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
  mode?: string;
  sha: string;
};

export type GithubSkillSourceClients = {
  api: HttpClient;
  raw: HttpClient;
};

export function createGithubSkillClients(): GithubSkillSourceClients {
  return {
    api: createHttpClient({
      baseUrl: 'https://api.github.com',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      timeoutMs: 15_000,
    }),
    raw: createHttpClient({ baseUrl: 'https://raw.githubusercontent.com', timeoutMs: 20_000 }),
  };
}

/**
 * Public GitHub repositories only. A mutable branch or tag is resolved to a
 * commit before anything is downloaded, so the accepted revision is exact and
 * the candidate handle carries it.
 */
export function createGithubSkillSource(clients: GithubSkillSourceClients): SkillSourceAdapter & {
  resolveUrl(url: string, signal?: AbortSignal): Promise<SkillSourceCandidate>;
  resolveRepository(
    owner: string,
    repo: string,
    options?: { ref?: string; directory?: string; name?: string },
    signal?: AbortSignal,
  ): Promise<SkillSourceCandidate[]>;
} {
  async function resolveLocation(
    location: GithubSkillLocation,
    signal?: AbortSignal,
  ): Promise<SkillSourceCandidate> {
    const sha = await resolveCommit(clients.api, location, signal);
    const entryPath = location.directory ? `${location.directory}/SKILL.md` : 'SKILL.md';
    const entryText = await downloadText(clients.raw, location, sha, entryPath, signal);
    const name =
      /^name:\s*(.+)$/m
        .exec(entryText)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '') ?? '';
    const description =
      /^description:\s*(.+)$/m
        .exec(entryText)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '') ?? '';
    const directoryName = location.directory.split('/').pop()!;
    return {
      candidateId: `github:${location.owner}/${location.repo}/${sha}/${location.directory}`,
      name: name || directoryName,
      description: description || `Skill from ${location.owner}/${location.repo}`,
      author: location.owner,
      version: sha.slice(0, 12),
      tags: [],
      source: {
        registry: 'github',
        locator: githubSkillLocator(location),
        url: `https://github.com/${location.owner}/${location.repo}/blob/${encodeURIComponent(location.ref)}/${entryPath}`,
        revision: sha,
      },
      reviewed: null,
    };
  }

  return {
    registry: 'github',
    async resolveRepository(owner, repo, options = {}, signal) {
      if (
        ![owner, repo].every(
          (part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..',
        )
      )
        throw new SkillsError('source-invalid', 'Invalid GitHub repository.');
      const location = {
        owner,
        repo,
        ref: options.ref ?? 'HEAD',
        directory: options.directory ?? '',
      };
      const sha = await resolveCommit(clients.api, location, signal);
      const tree = await listTree(clients.api, location, sha, signal);
      const paths = tree
        .filter(
          (entry) =>
            entry.type === 'blob' &&
            (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md')),
        )
        .map((entry) => (entry.path === 'SKILL.md' ? '' : entry.path.slice(0, -9)))
        .filter((directory) => options.directory === undefined || directory === options.directory)
        .filter(
          (directory) => !options.name || directory.split('/').pop() === options.name || !directory,
        );
      if (paths.length > 20)
        throw new SkillsError(
          'source-invalid',
          'This repository has many Skills. Provide a specific Skill directory or page.',
        );
      const result: SkillSourceCandidate[] = [];
      for (const directory of paths) {
        const candidate = await resolveLocation({ ...location, directory, ref: sha }, signal);
        if (options.name && candidate.name !== options.name) continue;
        candidate.source.url = `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(location.ref)}/${directory ? `${directory}/` : ''}SKILL.md`;
        result.push(candidate);
      }
      return result;
    },
    async resolveUrl(url, signal) {
      const location = parseGithubSkillUrl(url);
      if (!location) {
        throw new SkillsError('source-invalid', 'Enter the URL of a SKILL.md file on github.com.');
      }
      return resolveLocation(location, signal);
    },
    async resolve(locator, signal) {
      const location = parseGithubLocator(locator);
      if (!location) throw new SkillsError('source-invalid', `Invalid GitHub locator: ${locator}`);
      return resolveLocation({ ...location, ref: 'HEAD' }, signal);
    },
    async acquire(candidate, signal) {
      const location = parseGithubLocator(candidate.source.locator);
      if (!location)
        throw new SkillsError(
          'source-invalid',
          `Invalid GitHub locator: ${candidate.source.locator}`,
        );
      const sha = candidate.source.revision;
      const tree = await listTree(clients.api, location, sha, signal);
      const prefix = location.directory ? `${location.directory}/` : '';
      if (
        tree.some(
          (entry) =>
            entry.path.startsWith(prefix) && (entry.type === 'commit' || entry.mode === '120000'),
        )
      ) {
        throw new SkillsError(
          'package-invalid',
          'Skill packages cannot contain symlinks or submodules.',
        );
      }
      const blobs = tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix));
      if (blobs.length === 0) {
        throw new SkillsError(
          'package-invalid',
          'The Skill directory has no files at this revision.',
        );
      }
      if (blobs.length > SKILL_PACKAGE_MAX_FILES) {
        throw new SkillsError('package-too-large', 'The Skill directory has too many files.');
      }
      const declared = blobs.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
      if (declared > SKILL_PACKAGE_MAX_BYTES) {
        throw new SkillsError('package-too-large', 'The Skill package exceeds the size limit.');
      }
      const files = new Map<string, Uint8Array>();
      let total = 0;
      for (const entry of blobs) {
        const bytes = await downloadBytes(clients.raw, location, sha, entry.path, signal);
        total += bytes.byteLength;
        if (total > SKILL_PACKAGE_MAX_BYTES) {
          throw new SkillsError('package-too-large', 'The Skill package exceeds the size limit.');
        }
        files.set(entry.path.slice(prefix.length), bytes);
      }
      return { files, expectedName: location.directory.split('/').pop() || candidate.name };
    },
  };
}

async function resolveCommit(
  api: HttpClient,
  location: GithubSkillLocation,
  signal?: AbortSignal,
): Promise<string> {
  const response = await request<{ sha?: unknown }>(api, {
    method: 'GET',
    path: `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/commits/${encodeURIComponent(location.ref)}`,
    signal,
    maxResponseBytes: 256 * 1024,
  });
  const sha = response.sha;
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new SkillsError(
      'source-unreachable',
      'GitHub did not return a commit for this reference.',
    );
  }
  return sha;
}

async function listTree(
  api: HttpClient,
  location: Omit<GithubSkillLocation, 'ref'>,
  sha: string,
  signal?: AbortSignal,
): Promise<GithubTreeEntry[]> {
  const response = await request<{ tree?: unknown; truncated?: unknown }>(api, {
    method: 'GET',
    path: `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/trees/${sha}`,
    query: { recursive: '1' },
    signal,
    maxResponseBytes: 8 * 1024 * 1024,
  });
  if (!Array.isArray(response.tree)) {
    throw new SkillsError('source-unreachable', 'GitHub did not return the repository tree.');
  }
  const entries = response.tree as GithubTreeEntry[];
  if (response.truncated === true) {
    throw new SkillsError(
      'package-too-large',
      'The repository is too large to enumerate this Skill.',
    );
  }
  return entries;
}

async function downloadBytes(
  raw: HttpClient,
  location: Omit<GithubSkillLocation, 'ref'>,
  sha: string,
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await request<ArrayBuffer>(raw, {
    method: 'GET',
    path: `/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`,
    responseType: 'arraybuffer',
    signal,
    maxResponseBytes: SKILL_FILE_MAX_BYTES,
  });
  return new Uint8Array(response);
}

async function downloadText(
  raw: HttpClient,
  location: Omit<GithubSkillLocation, 'ref'>,
  sha: string,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const bytes = await downloadBytes(raw, location, sha, path, signal);
  return new TextDecoder().decode(bytes);
}

async function request<T>(
  client: HttpClient,
  input: Parameters<HttpClient['request']>[0],
): Promise<T> {
  try {
    return (await client.request<T>(input)).data;
  } catch (error) {
    if (isHttpError(error)) {
      if (error.kind === 'cancelled') throw error;
      if (error.status === 404) {
        throw new SkillsError('not-found', 'The Skill was not found on GitHub.', { cause: error });
      }
      throw new SkillsError('source-unreachable', 'GitHub could not be reached.', { cause: error });
    }
    throw error;
  }
}
