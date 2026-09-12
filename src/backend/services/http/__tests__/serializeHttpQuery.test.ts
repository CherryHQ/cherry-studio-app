import { serializeHttpQuery } from '../serializeHttpQuery';

describe('serializeHttpQuery', () => {
  it('serializes primitives and arrays in standard repeated-key form', () => {
    expect(
      serializeHttpQuery({
        cursor: 'abc def',
        limit: 20,
        tag: ['a', 'b'],
        verbose: true,
      }),
    ).toBe('cursor=abc+def&limit=20&tag=a&tag=b&verbose=true');
  });

  it('omits null and undefined values', () => {
    expect(serializeHttpQuery({ a: null, b: undefined, c: 'kept' })).toBe('c=kept');
  });

  it('percent-encodes reserved characters', () => {
    expect(serializeHttpQuery({ redirect: '/a?b=c&d' })).toBe('redirect=%2Fa%3Fb%3Dc%26d');
  });
});
