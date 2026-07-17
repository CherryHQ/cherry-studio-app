import { glyphIdentities, lineStartX, rippleDelayMs } from '../animatedTextLayout';

describe('glyphIdentities', () => {
  test('numbers repeated characters by occurrence', () => {
    expect(glyphIdentities('aba')).toEqual([
      { char: 'a', id: 'a:0' },
      { char: 'b', id: 'b:0' },
      { char: 'a', id: 'a:1' },
    ]);
  });

  test('shared characters agree on ids across two values', () => {
    const before = new Set(glyphIdentities('Claude').map((glyph) => glyph.id));
    const persisted = glyphIdentities('Cloud').filter((glyph) => before.has(glyph.id));

    expect(persisted.map((glyph) => glyph.char)).toEqual(['C', 'l', 'u', 'd']);
  });

  test('iterates by code point so surrogate pairs stay whole', () => {
    expect(glyphIdentities('🙂!🙂')).toEqual([
      { char: '🙂', id: '🙂:0' },
      { char: '!', id: '!:0' },
      { char: '🙂', id: '🙂:1' },
    ]);
  });

  test('is empty for an empty value', () => {
    expect(glyphIdentities('')).toEqual([]);
  });
});

describe('lineStartX', () => {
  test('centers the run of advances', () => {
    expect(lineStartX([10, 20, 30], 100, 'center')).toBe(20);
  });

  test('starts at zero when left-aligned', () => {
    expect(lineStartX([10, 20, 30], 100, 'left')).toBe(0);
  });

  test('centers overflowing text past the left edge', () => {
    expect(lineStartX([90, 90], 100, 'center')).toBe(-40);
  });
});

describe('rippleDelayMs', () => {
  test('is zero at the middle and grows outward', () => {
    expect(rippleDelayMs(2, 5, 20)).toBe(0);
    expect(rippleDelayMs(1, 5, 20)).toBe(20);
    expect(rippleDelayMs(4, 5, 20)).toBe(40);
  });

  test('is symmetric around the middle of an even-length string', () => {
    expect(rippleDelayMs(1, 4, 20)).toBe(rippleDelayMs(2, 4, 20));
    expect(rippleDelayMs(0, 4, 20)).toBe(rippleDelayMs(3, 4, 20));
  });

  test('single characters and zero steps never wait', () => {
    expect(rippleDelayMs(0, 1, 20)).toBe(0);
    expect(rippleDelayMs(3, 8, 0)).toBe(0);
  });
});
