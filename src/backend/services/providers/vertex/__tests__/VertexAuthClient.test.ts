import { webcrypto } from 'node:crypto';

import { HttpError, type HttpClient, type HttpRequest } from '@/backend/services/http';

import { VertexAuthClient } from '../VertexAuthClient';

// The native implementation still requires device acceptance; Node verifies the signing contract.
jest.mock('react-native-quick-crypto', () => ({
  subtle: jest.requireActual('node:crypto').webcrypto.subtle,
}));

describe('VertexAuthClient', () => {
  it('signs a service-account JWT with WebCrypto and reuses the live access token', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        hash: 'SHA-256',
        modulusLength: 2048,
        name: 'RSASSA-PKCS1-v1_5',
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const privateKey = toPem(await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const request = jest.fn(async (input: HttpRequest) => {
      const body = new URLSearchParams(String(input.body));
      const assertion = body.get('assertion');
      expect(assertion?.split('.')).toHaveLength(3);
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [header = '', claims = '', signature = ''] = assertion!.split('.');
      expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
        aud: 'https://oauth2.googleapis.com/token',
        iss: 'service@example.com',
        iat: 1_700_000_000,
      });
      expect(
        await webcrypto.subtle.verify(
          'RSASSA-PKCS1-v1_5',
          keyPair.publicKey,
          Buffer.from(signature, 'base64url'),
          new TextEncoder().encode(`${header}.${claims}`),
        ),
      ).toBe(true);
      expect(input).toMatchObject({
        method: 'POST',
        path: '/token',
        redirect: 'error',
        maxResponseBytes: 65536,
      });
      return tokenResponse('vertex-token');
    });
    const client = new VertexAuthClient({
      http: { request } as HttpClient,
      now: () => 1_700_000_000_000,
    });
    const input = {
      providerId: 'provider',
      projectId: 'project-id',
      serviceAccount: { clientEmail: 'service@example.com', privateKey },
    };

    await expect(client.getAccessToken(input)).resolves.toBe('vertex-token');
    await expect(client.getAccessToken(input)).resolves.toBe('vertex-token');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not include token endpoint response bodies in failures', async () => {
    const request = jest.fn(async (input: HttpRequest) => {
      const decoded = input.errorDecoder?.({
        data: { error_description: 'must-not-leak' },
        status: 401,
        headers: {},
      });
      throw new HttpError(decoded!.message, { kind: 'http', status: 401 });
    });
    const client = new VertexAuthClient({
      http: { request } as HttpClient,
      sign: async () => 'signed-assertion',
    });

    await expect(
      client.getAccessToken({
        providerId: 'provider',
        projectId: 'project-id',
        serviceAccount: { clientEmail: 'service@example.com', privateKey: 'private-key' },
      }),
    ).rejects.toThrow('Vertex service-account token request failed.');
  });

  it('isolates providers and replaced private keys, and refreshes before expiry', async () => {
    let now = 0;
    let count = 0;
    const request = jest.fn(async () => tokenResponse(`token-${++count}`));
    const client = new VertexAuthClient({
      http: { request } as HttpClient,
      now: () => now,
      sign: async () => 'assertion',
    });
    const input = authInput();
    await expect(client.getAccessToken(input)).resolves.toBe('token-1');
    await client.getAccessToken({ ...input, providerId: 'second' });
    const replacement = {
      ...input,
      serviceAccount: { ...input.serviceAccount, privateKey: 'replacement' },
    };
    await client.getAccessToken(replacement);
    await client.getAccessToken(replacement);
    now = 3_550_000;
    await client.getAccessToken(replacement);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('cancels one waiter without aborting another, and never caches a forgotten request', async () => {
    let finish!: (value: ReturnType<typeof tokenResponse>) => void;
    const request = jest.fn(
      () =>
        new Promise<ReturnType<typeof tokenResponse>>((resolve) => {
          finish = resolve;
        }),
    );
    const client = new VertexAuthClient({
      http: { request } as HttpClient,
      sign: async () => 'assertion',
    });
    const controller = new AbortController();
    const first = client.getAccessToken(authInput(), controller.signal);
    const second = client.getAccessToken(authInput());
    const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await cancelled;
    expect(request).toHaveBeenCalledTimes(1);
    const forgotten = expect(second).rejects.toMatchObject({ name: 'AbortError' });
    client.forget('provider');
    finish(tokenResponse('old-token'));
    await forgotten;
    const third = client.getAccessToken(authInput());
    await Promise.resolve();
    finish(tokenResponse('new-token'));
    await expect(third).resolves.toBe('new-token');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('aborts the exchange after the last waiter leaves or the service stops', async () => {
    let transportSignal: AbortSignal | undefined;
    const request = jest.fn(async (input: HttpRequest) => {
      transportSignal = input.signal;
      return new Promise<never>((_, reject) =>
        input.signal?.addEventListener('abort', () => reject(new Error('cancelled'))),
      );
    });
    const client = new VertexAuthClient({
      http: { request } as HttpClient,
      sign: async () => 'assertion',
    });
    const controller = new AbortController();
    const pending = client.getAccessToken(authInput(), controller.signal);
    const failed = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await failed;
    expect(transportSignal?.aborted).toBe(true);
    await client._doStop();
    await expect(client.getAccessToken(authInput())).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

function tokenResponse(token: string) {
  return { data: { access_token: token, expires_in: 3600 }, status: 200, headers: {} };
}

function authInput() {
  return {
    providerId: 'provider',
    projectId: 'project-id',
    serviceAccount: { clientEmail: 'svc@example.com', privateKey: 'private-key' },
  };
}

function toPem(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
}
