import { parseMcpHeaders, serializeMcpHeaders } from '../mcpHeaders';

describe('MCP request header text', () => {
  it('parses one header per line and preserves equals signs in values', () => {
    expect(
      parseMcpHeaders(
        'Authorization=Bearer token\nX-Signed-Value=payload=signature\nContent-Type=application/json',
      ),
    ).toEqual({
      ok: true,
      value: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
        'X-Signed-Value': 'payload=signature',
      },
    });
  });

  it('rejects malformed header lines', () => {
    expect(parseMcpHeaders('Authorization: Bearer token')).toEqual({ ok: false });
    expect(parseMcpHeaders('Invalid Header=value')).toEqual({ ok: false });
  });

  it('keeps the last case-insensitive duplicate and serializes stored headers', () => {
    expect(parseMcpHeaders('Authorization=first\nauthorization=second')).toEqual({
      ok: true,
      value: { authorization: 'second' },
    });
    expect(serializeMcpHeaders({ Authorization: 'Bearer token', 'X-API-Key': 'key' })).toBe(
      'Authorization=Bearer token\nX-API-Key=key',
    );
  });
});
