import { OAuthHttpError, PkceOAuthClient } from '../PkceOAuthClient';

const client = new PkceOAuthClient({
  clientId: 'client-1',
  tokenUrl: 'https://provider.test/oauth2/token',
});

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = jest.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock): URLSearchParams {
  return new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PkceOAuthClient', () => {
  it('posts the authorization_code grant and parses the token response', async () => {
    const controller = new AbortController();
    const fetchMock = mockFetchOnce({
      json: async () => ({
        access_token: 'tok',
        expires_in: 3600,
        refresh_token: 'r',
        token_type: 'bearer',
      }),
      ok: true,
    });

    await expect(
      client.exchangeCode(
        'the-code',
        'the-verifier',
        'cherrystudio://oauth/callback',
        controller.signal,
      ),
    ).resolves.toEqual({
      access_token: 'tok',
      expires_in: 3600,
      refresh_token: 'r',
      token_type: 'bearer',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.test/oauth2/token',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal: controller.signal,
      }),
    );

    const body = bodyOf(fetchMock);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    // RFC 6749 requires the exchange to echo the authorized redirect URI.
    expect(body.get('redirect_uri')).toBe('cherrystudio://oauth/callback');
  });

  it('posts the refresh_token grant without a redirect URI', async () => {
    const fetchMock = mockFetchOnce({
      json: async () => ({ access_token: 'tok2' }),
      ok: true,
    });

    await expect(client.refresh('the-refresh-token')).resolves.toEqual({ access_token: 'tok2' });

    const body = bodyOf(fetchMock);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('the-refresh-token');
    expect(body.get('redirect_uri')).toBeNull();
  });

  // The status is what OAuthRuntimeService grades terminal vs retriable by, so
  // it has to survive the throw.
  it('throws OAuthHttpError carrying status and body on a non-2xx exchange', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    });

    await expect(client.exchangeCode('c', 'v', 'app://cb')).rejects.toMatchObject({
      body: '{"error":"invalid_grant"}',
      name: 'OAuthHttpError',
      status: 400,
    });
  });

  it('throws OAuthHttpError on a non-2xx refresh', async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => 'slow down' });

    await expect(client.refresh('r')).rejects.toBeInstanceOf(OAuthHttpError);
  });

  it('surfaces an unreadable error body as an empty string rather than failing', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('stream already consumed');
      },
    });

    await expect(client.refresh('r')).rejects.toMatchObject({ body: '', status: 500 });
  });

  it('rejects a token response that is missing an access token', async () => {
    mockFetchOnce({ json: async () => ({ refresh_token: 'r' }), ok: true });

    await expect(client.refresh('r')).rejects.toThrow();
  });
});
