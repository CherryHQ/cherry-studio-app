import { parseHeaderText, serializeHeaders } from '../headerText';

describe('MCP header text', () => {
  it('parses one NAME=VALUE header per line and keeps equals signs in values', () => {
    expect(
      parseHeaderText(
        [
          ' Content-Type = application/json ',
          'Authorization=Bearer first=token',
          '# ignored comment',
          'Authorization=Bearer replacement',
        ].join('\n'),
      ),
    ).toEqual({
      headers: {
        Authorization: 'Bearer replacement',
        'Content-Type': 'application/json',
      },
      ok: true,
    });
  });

  it.each([
    ['missing separator', 'Authorization=Bearer token\ninvalid line', 2],
    ['missing name', '# comment\n\n=value', 3],
  ])('reports the first %s with its one-based line number', (_case, value, line) => {
    expect(parseHeaderText(value)).toEqual({ line, ok: false });
  });

  it('serializes saved headers in the desktop NAME=VALUE format', () => {
    expect(
      serializeHeaders({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      }),
    ).toBe('Authorization=Bearer token\nContent-Type=application/json');
    expect(serializeHeaders(undefined)).toBe('');
  });

  it('round-trips values containing equals signs', () => {
    const headers = { Authorization: 'Bearer abc=def==' };

    expect(parseHeaderText(serializeHeaders(headers))).toEqual({ headers, ok: true });
  });
});
