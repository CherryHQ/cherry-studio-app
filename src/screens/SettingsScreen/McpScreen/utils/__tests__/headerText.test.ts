import { parseHeaderText, serializeHeaders } from '../headerText';

describe('MCP header text', () => {
  it('parses one NAME=VALUE header per line and keeps equals signs in values', () => {
    expect(
      parseHeaderText(
        [
          ' Content-Type = application/json ',
          'Authorization=Bearer first=token',
          '# ignored comment',
          'invalid line',
          '=missing-name',
          'Authorization=Bearer replacement',
        ].join('\n'),
      ),
    ).toEqual({
      Authorization: 'Bearer replacement',
      'Content-Type': 'application/json',
    });
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

    expect(parseHeaderText(serializeHeaders(headers))).toEqual(headers);
  });
});
