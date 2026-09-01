import * as z from 'zod';

import { createHttpClient, type HttpClient } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';

import { requestWebSearchJson } from '../requestWebSearchJson';

jest.mock('@/backend/services/http', () => ({
  createHttpClient: jest.fn(),
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({
  defaultAppHeaders: jest.fn(() => ({ 'X-App-Name': 'CherryStudioMobile' })),
}));

const createHttpClientMock = jest.mocked(createHttpClient);
const defaultAppHeadersMock = jest.mocked(defaultAppHeaders);
const requestMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  requestMock.mockReset();
  createHttpClientMock.mockReturnValue({ request: requestMock } as unknown as HttpClient);
});

describe('requestWebSearchJson', () => {
  it('binds the origin as the route and moves path and repeated query values into the request', async () => {
    requestMock.mockResolvedValue({ data: { results: [] }, headers: {}, status: 200 });

    await expect(
      requestWebSearchJson<{ results: unknown[] }>({
        headers: { Authorization: 'Bearer provider-key' },
        method: 'GET',
        operation: 'search',
        providerId: 'searxng',
        responseSchema: z.object({ results: z.array(z.unknown()) }),
        url: 'https://search.example.com/root/search?q=hello&engine=a&engine=b',
      }),
    ).resolves.toEqual({ results: [] });

    expect(defaultAppHeadersMock).toHaveBeenCalledTimes(1);
    expect(createHttpClientMock).toHaveBeenCalledWith({
      baseUrl: 'https://search.example.com',
      headers: { 'X-App-Name': 'CherryStudioMobile' },
    });
    expect(requestMock).toHaveBeenCalledWith({
      errorDecoder: expect.any(Function),
      headers: { Authorization: 'Bearer provider-key' },
      method: 'GET',
      path: '/root/search',
      query: { engine: ['a', 'b'], q: 'hello' },
      signal: undefined,
    });
  });

  it('passes a parsed request body and exposes only validated error fields', async () => {
    requestMock.mockResolvedValue({ data: { ok: true }, headers: {}, status: 200 });

    await requestWebSearchJson<{ ok: boolean }, { query: string }>({
      body: { query: 'hello' },
      method: 'POST',
      operation: 'search',
      providerId: 'tavily',
      responseSchema: z.object({ ok: z.boolean() }),
      url: 'https://api.tavily.com/search',
    });

    const transportRequest = requestMock.mock.calls[0]?.[0];
    expect(transportRequest).toMatchObject({
      body: { query: 'hello' },
      method: 'POST',
      path: '/search',
    });
    expect(
      transportRequest.errorDecoder({
        data: { error: { message: 'quota exceeded' }, token: 'secret' },
        headers: {},
        status: 429,
      }),
    ).toEqual({
      code: undefined,
      details: { operation: 'search', providerId: 'tavily' },
      message: 'tavily search failed: quota exceeded',
    });
  });

  it('rejects text or schema-invalid success payloads at the domain boundary', async () => {
    requestMock.mockResolvedValueOnce({ data: 'not-json', headers: {}, status: 200 });

    await expect(
      requestWebSearchJson({
        method: 'GET',
        operation: 'search',
        providerId: 'exa',
        responseSchema: z.object({ results: z.array(z.unknown()) }),
        url: 'https://api.exa.ai/search',
      }),
    ).rejects.toThrow('exa search returned invalid JSON');

    requestMock.mockResolvedValueOnce({ data: { unexpected: true }, headers: {}, status: 200 });

    await expect(
      requestWebSearchJson({
        method: 'GET',
        operation: 'search',
        providerId: 'exa',
        responseSchema: z.object({ results: z.array(z.unknown()) }),
        url: 'https://api.exa.ai/search',
      }),
    ).rejects.toThrow('exa search response validation failed');
  });
});
