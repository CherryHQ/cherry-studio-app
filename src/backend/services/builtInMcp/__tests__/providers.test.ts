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
