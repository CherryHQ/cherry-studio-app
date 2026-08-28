import { VertexAuthClient } from '../VertexAuthClient';

describe('VertexAuthClient', () => {
  it('signs a service-account JWT with WebCrypto and reuses the live access token', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        hash: 'SHA-256',
        modulusLength: 2048,
        name: 'RSASSA-PKCS1-v1_5',
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const privateKey = toPem(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      const assertion = body.get('assertion');
      expect(assertion?.split('.')).toHaveLength(3);
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      return new Response(
        JSON.stringify({ access_token: 'vertex-token', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200 },
      );
    });
    const client = new VertexAuthClient({ fetch, now: () => 1_700_000_000_000 });
    const input = {
      projectId: 'project-id',
      serviceAccount: { clientEmail: 'service@example.com', privateKey },
    };

    await expect(client.getAuthorizationHeaders(input)).resolves.toEqual({
      Authorization: 'Bearer vertex-token',
    });
    await expect(client.getAuthorizationHeaders(input)).resolves.toEqual({
      Authorization: 'Bearer vertex-token',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not include token endpoint response bodies in failures', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        hash: 'SHA-256',
        modulusLength: 2048,
        name: 'RSASSA-PKCS1-v1_5',
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const privateKey = toPem(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const client = new VertexAuthClient({
      fetch: jest.fn(
        async () =>
          new Response(JSON.stringify({ access_token: 'must-not-leak' }), { status: 401 }),
      ),
    });

    await expect(
      client.getAuthorizationHeaders({
        projectId: 'project-id',
        serviceAccount: { clientEmail: 'service@example.com', privateKey },
      }),
    ).rejects.toThrow('Vertex service-account token request failed: 401');
  });
});

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
