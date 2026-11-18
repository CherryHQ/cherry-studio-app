import { loggerService } from '@logger';

import { createHttpClient } from '@/backend/services/http';
import { repositorySourceOrder, type RepositorySource } from '@/backend/services/region';
import { raceAbort } from '@/backend/utils/raceAbort';
import type { AgentTemplatesModule } from '@/shared/contracts/agentTemplates';
import type {
  AgentTemplateCatalog,
  AgentTemplateLanguage,
} from '@/shared/data/types/agentTemplate';

import { parseAgentTemplateCatalog } from './agentTemplateCatalog';
import {
  readAgentTemplateSnapshot,
  writeAgentTemplateSnapshot,
  type AgentTemplateSnapshot,
} from './agentTemplateSnapshot';

const logger = loggerService.withContext('AgentTemplates');
const repository = '/repos/CherryHQ/cherry-studio';
const options = {
  headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  timeoutMs: 15_000,
};
const gitcode = createHttpClient({
  ...options,
  baseUrl: `https://api.gitcode.com/api/v5${repository}`,
});
const github = createHttpClient({ ...options, baseUrl: `https://api.github.com${repository}` });
const rawGithub = createHttpClient({
  ...options,
  baseUrl: 'https://raw.githubusercontent.com/CherryHQ/cherry-studio',
});
async function readRevision(source: RepositorySource, signal: AbortSignal): Promise<string | null> {
  try {
    const { data } = await (source === 'gitcode' ? gitcode : github).request<unknown>({
      method: 'GET',
      path: '/branches/main',
      maxResponseBytes: 256 * 1024,
      signal,
    });
    const branch = data as { commit?: { id?: unknown; sha?: unknown } } | null;
    const revision = source === 'gitcode' ? branch?.commit?.id : branch?.commit?.sha;
    return typeof revision === 'string' && revision.trim() ? revision.trim() : null;
  } catch (error) {
    signal.throwIfAborted();
    logger.warn('Template revision unavailable; using the default branch', { source, error });
    return null;
  }
}

async function readCatalogFile(
  source: RepositorySource,
  revision: string | null,
  name: string,
  signal: AbortSignal,
): Promise<unknown> {
  const path = `resources/data/${name}`;
  const { data } = await (source === 'gitcode' ? gitcode : rawGithub).request<string>({
    method: 'GET',
    responseType: 'text',
    maxResponseBytes: 5 * 1024 * 1024,
    signal,
    path:
      source === 'gitcode'
        ? `/raw/${encodeURIComponent(path)}`
        : `/${encodeURIComponent(revision ?? 'main')}/${path}`,
    query: source === 'gitcode' ? { ref: revision ?? 'main' } : undefined,
  });
  return JSON.parse(data);
}

export function createAgentTemplatesModule(dependencies: {
  getCountry(): Promise<string | null>;
}): AgentTemplatesModule & { dispose(): Promise<void> } {
  const lifetime = new AbortController();
  const snapshots = new Map<AgentTemplateLanguage, Promise<AgentTemplateSnapshot | null>>();
  const catalogs = new Map<AgentTemplateLanguage, AgentTemplateCatalog>();
  const requests = new Map<AgentTemplateLanguage, Promise<AgentTemplateCatalog>>();

  function readSnapshot(language: AgentTemplateLanguage) {
    lifetime.signal.throwIfAborted();
    if (!snapshots.has(language)) snapshots.set(language, readAgentTemplateSnapshot(language));
    return snapshots.get(language)!;
  }

  async function refresh(language: AgentTemplateLanguage): Promise<AgentTemplateCatalog> {
    const { signal } = lifetime;
    const previous = await readSnapshot(language);
    const country = await raceAbort(dependencies.getCountry(), signal);
    let lastError: unknown;
    for (const source of repositorySourceOrder(country)) {
      try {
        const revision = await readRevision(source, signal);
        signal.throwIfAborted();
        if (revision && previous?.isComplete && previous.catalog.revision === revision) {
          catalogs.set(language, previous.catalog);
          return previous.catalog;
        }
        const [legacy, agents] = await Promise.allSettled([
          readCatalogFile(source, revision, `agents-${language}.json`, signal),
          readCatalogFile(source, revision, 'marketplace-agents.json', signal),
        ]);
        signal.throwIfAborted();
        if (legacy.status === 'rejected' && agents.status === 'rejected') throw legacy.reason;
        const catalog = parseAgentTemplateCatalog(
          legacy.status === 'fulfilled' ? legacy.value : undefined,
          agents.status === 'fulfilled' ? agents.value : undefined,
          language,
          revision ?? '',
        );
        if (!catalog.templates.length)
          throw new Error('No templates are available from this source');
        catalogs.set(language, catalog);
        try {
          const snapshot = await writeAgentTemplateSnapshot(
            catalog,
            previous,
            legacy.status === 'fulfilled' && agents.status === 'fulfilled',
          );
          signal.throwIfAborted();
          snapshots.set(language, Promise.resolve(snapshot));
        } catch (error) {
          signal.throwIfAborted();
          logger.warn('Could not save templates; keeping downloaded content in memory', {
            language,
            error,
          });
        }
        return catalog;
      } catch (error) {
        signal.throwIfAborted();
        logger.warn('Template source unavailable; trying the next source', {
          source,
          language,
          error,
        });
        lastError = error;
      }
    }
    throw lastError ?? new Error('No template catalog source is available');
  }

  return {
    async readCached(language) {
      const snapshot = await readSnapshot(language);
      return catalogs.get(language) ?? snapshot?.catalog ?? null;
    },
    refresh(language, signal) {
      lifetime.signal.throwIfAborted();
      signal?.throwIfAborted();
      if (!requests.has(language)) {
        requests.set(
          language,
          refresh(language).finally(() => {
            requests.delete(language);
          }),
        );
      }
      const pending = requests.get(language)!;
      return signal ? raceAbort(pending, signal) : pending;
    },
    async dispose() {
      lifetime.abort();
      await Promise.allSettled([...snapshots.values(), ...requests.values()]);
      snapshots.clear();
      catalogs.clear();
    },
  };
}
