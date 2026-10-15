import { createHttpClient } from '@/backend/services/http';

import { createMcpOAuthFetch } from '../mcpOAuthFetch';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http/createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ data: '{}', headers: {}, status: 200 });
});

it('bounds OAuth responses and time on the shared transport', async () => {
  await createMcpOAuthFetch()('https://auth.example/token', { method: 'POST', body: 'code=x' });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({ maxResponseBytes: 512 * 1024, timeoutMs: 30_000 }),
  );
});

it.each([
  'http://auth.example/token',
  'https://user:secret@auth.example/token',
  'https://auth.example/token#fragment',
])('rejects an invalid OAuth destination before transport: %s', async (url) => {
  await expect(createMcpOAuthFetch()(url)).rejects.toMatchObject({ code: 'configuration' });
  expect(createHttpClient).not.toHaveBeenCalled();
});

it('rejects methods other than GET and POST as a configuration error', async () => {
  await expect(
    createMcpOAuthFetch()('https://auth.example/token', { method: 'DELETE' }),
  ).rejects.toMatchObject({ code: 'configuration' });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('retains loopback support for local OAuth servers', async () => {
  await createMcpOAuthFetch()('http://127.0.0.1:3000/token');
  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'http://127.0.0.1:3000',
    statusPolicy: 'all',
  });
});
