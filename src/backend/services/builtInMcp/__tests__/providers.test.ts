import { HttpError } from '@/backend/services/http/HttpError';

import { createAmapClient } from '../providers/amap';
import { createGitHubClient } from '../providers/github';

const mockRequest = jest.fn();
const mockRoutes: {
  baseUrl: string;
  interceptors: { onRequest(request: unknown): Promise<unknown> }[];
}[] = [];
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http/HttpError'),
  createHttpClient: (options: (typeof mockRoutes)[number]) => {
    mockRoutes.push(options);
    return { request: mockRequest };
  },
}));

const signal = new AbortController().signal;
beforeEach(() => {
  mockRequest.mockReset();
  mockRoutes.length = 0;
});

it.each([
  ['github', 'get_me', []],
  ['github', 'search_repositories', ['query']],
  ['github', 'search_issues', ['query']],
  ['github', 'get_file_contents', ['owner', 'repo']],
  ['github', 'list_pull_requests', ['owner', 'repo']],
  ['github', 'get_issue', ['owner', 'repo', 'issue_number']],
  ['github', 'create_issue', ['owner', 'repo', 'title']],
  ['github', 'add_issue_comment', ['owner', 'repo', 'issue_number', 'body']],
  ['github', 'create_pull_request', ['owner', 'repo', 'title', 'head', 'base']],
  ['amap', 'search_places', ['keywords']],
  ['amap', 'search_nearby', ['location', 'keywords']],
  ['amap', 'geocode', ['address']],
  ['amap', 'reverse_geocode', ['location']],
  ['amap', 'driving_route', ['origin', 'destination']],
  ['amap', 'walking_route', ['origin', 'destination']],
  ['amap', 'transit_route', ['origin', 'destination', 'city']],
  ['amap', 'weather', ['city']],
  ['amap', 'search_district', ['keywords']],
] as const)('advertises only caller-required inputs for %s.%s', (pluginId, name, required) => {
  const provider =
    pluginId === 'github'
      ? createGitHubClient(async () => 'secret')
      : createAmapClient(async () => 'secret');
  const tool = provider.tools.find((candidate) => candidate.definition.name === name)!;

  const requiredInputs = tool.definition.inputSchema.required ?? [];
  expect(requiredInputs).toHaveLength(required.length);
  expect(requiredInputs).toEqual(expect.arrayContaining([...required]));
  expect(tool.definition.inputSchema.additionalProperties).toBe(false);
});

it('fills omitted pagination defaults in GitHub and Amap requests', async () => {
  mockRequest.mockResolvedValueOnce({
    data: JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }),
  });
  const githubTool = createGitHubClient(async () => 'secret').tools.find(
    (tool) => tool.definition.name === 'search_repositories',
  )!;
  await githubTool.execute({ query: 'cherry' }, signal);
  expect(mockRequest).toHaveBeenLastCalledWith(
    expect.objectContaining({ query: { q: 'cherry', page: 1, per_page: 10 } }),
  );

  mockRequest.mockResolvedValueOnce({
    data: JSON.stringify({ status: '1', infocode: '10000', pois: [] }),
  });
  const amapTool = createAmapClient(async () => 'secret').tools.find(
    (tool) => tool.definition.name === 'search_places',
  )!;
  await amapTool.execute({ keywords: 'coffee' }, signal);
  expect(mockRequest).toHaveBeenLastCalledWith(
    expect.objectContaining({
      query: { keywords: 'coffee', page: 1, offset: 10, extensions: 'base' },
    }),
  );
});

it('keeps GitHub bearer headers and Amap query credentials on separate HTTP routes', async () => {
  createGitHubClient(async () => 'github-secret');
  createAmapClient(async () => 'amap-secret');
  expect(mockRoutes.map((route) => route.baseUrl)).toEqual([
    'https://api.github.com',
    'https://restapi.amap.com',
  ]);
  expect(await mockRoutes[0].interceptors[0].onRequest({ method: 'GET', path: '/user' })).toEqual({
    method: 'GET',
    path: '/user',
    headers: { Authorization: 'Bearer github-secret' },
  });
  expect(
    await mockRoutes[1].interceptors[0].onRequest({ method: 'GET', path: '/v3/config/district' }),
  ).toEqual({
    method: 'GET',
    path: '/v3/config/district',
    query: { key: 'amap-secret', output: 'JSON' },
  });
});

it('rejects unbounded pagination and traversal before making a request', async () => {
  const github = createGitHubClient(async () => 'secret');
  await expect(
    github.tools
      .find((tool) => tool.definition.name === 'search_repositories')!
      .execute({ query: 'expo', per_page: 1000 }, signal),
  ).rejects.toThrow();
  await expect(
    github.tools
      .find((tool) => tool.definition.name === 'get_file_contents')!
      .execute({ owner: 'expo', repo: 'expo', path: '../secret' }, signal),
  ).rejects.toThrow();
  const amap = createAmapClient(async () => 'secret');
  await expect(
    amap.tools
      .find((tool) => tool.definition.name === 'search_nearby')!
      .execute({ location: '181,92', keywords: 'coffee' }, signal),
  ).rejects.toThrow();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('bounds reads, propagates cancellation, and strips unused GitHub response fields', async () => {
  mockRequest.mockResolvedValue({
    data: JSON.stringify({ login: 'cherry', id: 1, sensitive: 'omit' }),
  });
  await expect(createGitHubClient(async () => 'secret').getAccount(signal)).resolves.toEqual({
    login: 'cherry',
    id: 1,
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/user',
      method: 'GET',
      signal,
      responseType: 'text',
      maxResponseBytes: 512 * 1024,
    }),
  );
});

it('does not retry a GitHub write with an unknown outcome', async () => {
  mockRequest.mockRejectedValue(new HttpError('wire secret', { kind: 'timeout' }));
  const tool = createGitHubClient(async () => 'secret').tools.find(
    (candidate) => candidate.definition.name === 'create_issue',
  )!;
  await expect(
    tool.execute({ owner: 'cherry', repo: 'app', title: 'A bug' }, signal),
  ).rejects.toThrow('outcome is unknown');
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it.each(['server-error', 'unsupported-response'])(
  'reports an unknown write outcome after %s because GitHub may have committed it',
  async (failure) => {
    if (failure === 'server-error')
      mockRequest.mockRejectedValue(new HttpError('upstream error', { kind: 'http', status: 500 }));
    else mockRequest.mockResolvedValue({ data: JSON.stringify({ changed: true }) });
    const tool = createGitHubClient(async () => 'secret').tools.find(
      (candidate) => candidate.definition.name === 'create_issue',
    )!;
    await expect(
      tool.execute({ owner: 'cherry', repo: 'app', title: 'A bug' }, signal),
    ).rejects.toThrow('outcome is unknown');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it('returns decoded UTF-8 repository text and rejects binary contents without exposing them', async () => {
  const file = {
    type: 'file',
    name: 'README.md',
    path: 'README.md',
    size: 20,
    encoding: 'base64',
    content: Buffer.from('# Cherry\n你好\n').toString('base64') + '\n',
    html_url: 'https://github.com/cherry/app/blob/main/README.md',
  };
  const tool = createGitHubClient(async () => 'secret').tools.find(
    (candidate) => candidate.definition.name === 'get_file_contents',
  )!;
  mockRequest.mockResolvedValueOnce({ data: JSON.stringify(file) });
  await expect(
    tool.execute({ owner: 'cherry', repo: 'app', path: 'README.md' }, signal),
  ).resolves.toEqual({ ...file, encoding: 'utf-8', content: '# Cherry\n你好\n' });
  mockRequest.mockResolvedValueOnce({ data: JSON.stringify({ ...file, content: '/w==' }) });
  await expect(
    tool.execute({ owner: 'cherry', repo: 'app', path: 'binary.dat' }, signal),
  ).rejects.toThrow('unsupported response');
});

it('treats Amap HTTP 200 authorization errors as failures without echoing diagnostics', async () => {
  mockRequest.mockResolvedValue({
    data: JSON.stringify({ status: '0', infocode: '10001', info: 'invalid secret' }),
  });
  await expect(createAmapClient(async () => 'secret').validateCredential()).rejects.toThrow(
    'Amap rejected this key',
  );
});

it('uses longitude-first GCJ-02 route parameters and bounds the response', async () => {
  mockRequest.mockResolvedValue({
    data: JSON.stringify({ status: '1', infocode: '10000', info: 'OK', route: { paths: [] } }),
  });
  const tool = createAmapClient(async () => 'secret').tools.find(
    (candidate) => candidate.definition.name === 'driving_route',
  )!;
  await expect(
    tool.execute({ origin: '121.4,31.2', destination: '121.5,31.3' }, signal),
  ).resolves.toEqual({ route: { paths: [] } });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/v3/direction/driving',
      query: { origin: '121.4,31.2', destination: '121.5,31.3', extensions: 'base', strategy: 0 },
      signal,
      maxResponseBytes: 256 * 1024,
    }),
  );
});
