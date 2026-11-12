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
const newer = { schemaVersion: 1, items: [] };
const savedCatalog = parseAgentTemplateCatalog(legacy, newer, 'en', gitcodeRevision);
const saved = {
  schemaVersion: 1 as const,
  fetchedAt: 1,
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
    .mockImplementation(async (catalog: AgentTemplateCatalog) => ({ ...saved, catalog }));
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

it('keeps the saved catalog when every source fails validation', async () => {
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
