import type { AgentTemplateCatalog } from '@/shared/data/types/agentTemplate';

import { parseAgentTemplateCatalog } from '../agentTemplateCatalog';
import { readAgentTemplateSnapshot, writeAgentTemplateSnapshot } from '../agentTemplateSnapshot';
import { createAgentTemplatesModule } from '../createAgentTemplatesModule';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
}));
jest.mock('../agentTemplateSnapshot', () => ({
  readAgentTemplateSnapshot: jest.fn(),
  writeAgentTemplateSnapshot: jest.fn(),
}));

const gitcodeRevision = 'a'.repeat(40);
const githubRevision = 'b'.repeat(40);
const legacy = [
  {
    id: 'writer',
    name: 'Writer',
    description: 'Writes',
    emoji: '✍️',
    group: ['Writing'],
    prompt: 'Write.\r\n',
  },
];
const newer = {
  schemaVersion: 1,
  items: [
    {
      id: 'editor',
      name: { en: 'Editor', zh: '编辑' },
      description: { en: 'Edits', zh: '编辑文字' },
      avatar: '📝',
      category: 'Writing',
      instructions: 'Edit.',
    },
  ],
};
const savedCatalog = parseAgentTemplateCatalog(legacy, newer, 'en', gitcodeRevision);
const saved = {
  schemaVersion: 1 as const,
  fetchedAt: 1,
  isComplete: true,
  catalog: savedCatalog,
  slot: 'a' as const,
};
type Request = { path: string; signal: AbortSignal; query?: { ref: string } };

function response(_baseUrl: string, { path }: Request) {
  return {
    data:
      path === '/branches/main'
        ? { commit: { id: gitcodeRevision, sha: githubRevision } }
        : JSON.stringify(path.includes('marketplace-agents') ? newer : legacy),
  };
}

const getCountry = jest.fn<Promise<string | null>, []>();
let activeModule: ReturnType<typeof createAgentTemplatesModule>;
beforeEach(() => {
  jest.clearAllMocks();
  getCountry.mockResolvedValue('US');
  mockRequest.mockImplementation(response);
  jest.mocked(readAgentTemplateSnapshot).mockResolvedValue(null);
  jest
    .mocked(writeAgentTemplateSnapshot)
    .mockImplementation(async (catalog: AgentTemplateCatalog, _previous, isComplete = true) => ({
      ...saved,
      catalog,
      isComplete,
    }));
  activeModule = createAgentTemplatesModule({ getCountry });
});
afterEach(async () => {
  await activeModule.dispose();
});

it.each([
  ['CN', 'api.gitcode.com', gitcodeRevision],
  ['US', 'api.github.com', githubRevision],
  [null, 'api.gitcode.com', gitcodeRevision],
])(
  'uses the shared country policy for %s and pins both files to that source revision',
  async (country, host, revision) => {
    getCountry.mockResolvedValue(country);
    await expect(activeModule.refresh('zh')).resolves.toMatchObject({ language: 'zh', revision });
    expect(new URL(mockRequest.mock.calls[0]![0]).hostname).toBe(host);
    const downloads = mockRequest.mock.calls.filter(
      ([, request]) => request.path !== '/branches/main',
    );
    expect(downloads).toHaveLength(2);
    for (const [baseUrl, request] of downloads) {
      if (host === 'api.gitcode.com') {
        expect(baseUrl).toContain('api.gitcode.com');
        expect(request).toMatchObject({ query: { ref: revision } });
        expect(request.path).toMatch(/^\/raw\/resources%2Fdata%2F/);
      } else {
        expect(baseUrl).toContain('raw.githubusercontent.com');
        expect(request.path).toMatch(new RegExp(`^/${revision}/resources/data/`));
      }
    }
    expect(
      downloads.some(([, request]) => decodeURIComponent(request.path).endsWith('agents-zh.json')),
    ).toBe(true);
  },
);

it('reads disk lazily and skips full downloads when the revision is unchanged', async () => {
  getCountry.mockResolvedValue('CN');
  jest.mocked(readAgentTemplateSnapshot).mockResolvedValue(saved);
  expect(readAgentTemplateSnapshot).not.toHaveBeenCalled();
  await expect(activeModule.readCached('en')).resolves.toEqual(savedCatalog);
  expect(mockRequest).not.toHaveBeenCalled();
  await expect(activeModule.refresh('en')).resolves.toEqual(savedCatalog);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(writeAgentTemplateSnapshot).not.toHaveBeenCalled();
});

it('falls back after invalid primary content and resolves the fallback commit independently', async () => {
  getCountry.mockResolvedValue('CN');
  mockRequest.mockImplementation((baseUrl: string, request: Request) =>
    baseUrl.includes('gitcode') && request.path !== '/branches/main'
      ? { data: '{' }
      : response(baseUrl, request),
  );
  await expect(activeModule.refresh('en')).resolves.toMatchObject({ revision: githubRevision });
  expect(writeAgentTemplateSnapshot).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledWith(
    expect.stringContaining('api.github.com'),
    expect.objectContaining({ path: '/branches/main' }),
  );
});

it('keeps the saved catalog when no source has readable templates', async () => {
  jest.mocked(readAgentTemplateSnapshot).mockResolvedValue(saved);
  mockRequest.mockImplementation((_baseUrl: string, request: Request) =>
    request.path === '/branches/main'
      ? { data: { commit: { id: githubRevision, sha: githubRevision } } }
      : { data: '[]' },
  );
  await expect(activeModule.refresh('en')).rejects.toThrow();
  await expect(activeModule.readCached('en')).resolves.toEqual(savedCatalog);
  expect(writeAgentTemplateSnapshot).not.toHaveBeenCalled();
});

it.each(['agents-en.json', 'marketplace-agents.json'])(
  'uses the available file when %s fails, then retries the same revision for complete content',
  async (failedFile) => {
    mockRequest.mockImplementation((baseUrl: string, request: Request) => {
      if (decodeURIComponent(request.path).endsWith(failedFile)) throw new Error('Timed out');
      return response(baseUrl, request);
    });
    const partial = await activeModule.refresh('en');
    expect(partial.templates.map((item) => item.id)).toEqual([
      failedFile === 'agents-en.json' ? 'editor' : 'writer',
    ]);
    expect(writeAgentTemplateSnapshot).toHaveBeenCalledWith(partial, null, false);
    await expect(activeModule.readCached('en')).resolves.toEqual(partial);
    expect(mockRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('gitcode'),
      expect.anything(),
    );

    mockRequest.mockImplementation(response);
    const complete = await activeModule.refresh('en');
    expect(complete.revision).toBe(partial.revision);
    expect(complete.templates.map((item) => item.id)).toEqual(['writer', 'editor']);
    expect(writeAgentTemplateSnapshot).toHaveBeenLastCalledWith(
      complete,
      expect.objectContaining({ isComplete: false }),
      true,
    );
  },
);

it('retries a partial snapshot restored from disk even when its revision is unchanged', async () => {
  jest.mocked(readAgentTemplateSnapshot).mockResolvedValue({
    ...saved,
    isComplete: false,
    catalog: {
      ...savedCatalog,
      revision: githubRevision,
      templates: savedCatalog.templates.slice(0, 1),
    },
  });
  const catalog = await activeModule.refresh('en');
  expect(catalog.templates.map((item) => item.id)).toEqual(['writer', 'editor']);
  expect(writeAgentTemplateSnapshot).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'failed'])(
  'downloads the default branch when revision metadata is %s without freezing that fallback',
  async (failure) => {
    mockRequest.mockImplementation((baseUrl: string, request: Request) => {
      if (request.path === '/branches/main') {
        if (failure === 'failed') throw new Error('Rate limited');
        return { data: { commit: { futureField: 'unknown' } } };
      }
      return response(baseUrl, request);
    });
    await expect(activeModule.refresh('en')).resolves.toMatchObject({ revision: '' });
    await activeModule.refresh('en');
    const downloads = mockRequest.mock.calls.filter(
      ([, request]) => request.path !== '/branches/main',
    );
    expect(downloads).toHaveLength(4);
    expect(downloads.every(([, request]) => request.path.startsWith('/main/resources/data/'))).toBe(
      true,
    );
  },
);

it('serves downloaded templates from memory when saving fails and retries persistence later', async () => {
  jest.mocked(readAgentTemplateSnapshot).mockResolvedValue(saved);
  jest.mocked(writeAgentTemplateSnapshot).mockRejectedValueOnce(new Error('Disk full'));
  const catalog = await activeModule.refresh('en');
  expect(catalog.revision).toBe(githubRevision);
  await expect(activeModule.readCached('en')).resolves.toEqual(catalog);
  expect(mockRequest).not.toHaveBeenCalledWith(
    expect.stringContaining('gitcode'),
    expect.anything(),
  );

  await expect(activeModule.refresh('en')).resolves.toEqual(catalog);
  expect(writeAgentTemplateSnapshot).toHaveBeenCalledTimes(2);
  expect(writeAgentTemplateSnapshot).toHaveBeenLastCalledWith(catalog, saved, true);
});

it('serves a first-use download without requiring a writable snapshot directory', async () => {
  jest.mocked(writeAgentTemplateSnapshot).mockRejectedValueOnce(new Error('Cannot move file'));
  const catalog = await activeModule.refresh('en');
  expect(catalog.templates.map((item) => item.id)).toEqual(['writer', 'editor']);
  await expect(activeModule.readCached('en')).resolves.toEqual(catalog);
});

it('shares a refresh while allowing one caller to stop waiting', async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockRequest.mockImplementation(async (baseUrl: string, request: Request) => {
    await barrier;
    return response(baseUrl, request);
  });
  const caller = new AbortController();
  const cancelled = activeModule.refresh('en', caller.signal);
  const survivor = activeModule.refresh('en');
  caller.abort(new Error('Caller left'));
  await expect(cancelled).rejects.toThrow('Caller left');
  release();
  await expect(survivor).resolves.toMatchObject({ revision: githubRevision });
  expect(
    mockRequest.mock.calls.filter(([, request]) => request.path === '/branches/main'),
  ).toHaveLength(1);
  expect(writeAgentTemplateSnapshot).toHaveBeenCalledTimes(1);
  await expect(activeModule.readCached('en')).resolves.toMatchObject({ revision: githubRevision });
});

it('aborts and joins owned network work during disposal', async () => {
  let started!: () => void;
  const admitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockRequest.mockImplementation(
    (_baseUrl: string, { signal }: Request) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started();
      }),
  );
  const pending = activeModule.refresh('en');
  const rejected = expect(pending).rejects.toThrow();
  await admitted;
  await activeModule.dispose();
  await rejected;
  expect(writeAgentTemplateSnapshot).not.toHaveBeenCalled();
  await expect(activeModule.readCached('en')).rejects.toThrow();
});

it('joins a pending snapshot write and does not swallow disposal as a cache failure', async () => {
  let started!: () => void;
  const admitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: () => void;
  jest.mocked(writeAgentTemplateSnapshot).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        finish = () => reject(new Error('Write interrupted'));
        started();
      }),
  );
  const pending = activeModule.refresh('en');
  const rejected = expect(pending).rejects.toThrow();
  await admitted;
  const disposal = activeModule.dispose();
  finish();
  await disposal;
  await rejected;
  await expect(activeModule.readCached('en')).rejects.toThrow();
});
