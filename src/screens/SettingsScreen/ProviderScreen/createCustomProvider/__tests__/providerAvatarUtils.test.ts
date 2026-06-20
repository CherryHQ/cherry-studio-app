import {
  generateColorFromChar,
  getForegroundColor,
  getProviderAvatarColor,
} from '../providerAvatarUtils';

describe('generateColorFromChar', () => {
  it('generates a valid hex color code', () => {
    const result = generateColorFromChar('A');
    expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('generates consistent color for same input', () => {
    expect(generateColorFromChar('A')).toBe(generateColorFromChar('A'));
  });

  it('generates different colors for different inputs', () => {
    expect(generateColorFromChar('A')).not.toBe(generateColorFromChar('B'));
  });
});

describe('getForegroundColor', () => {
  it('returns white for dark backgrounds', () => {
    expect(getForegroundColor('#000000')).toBe('#FFFFFF');
    expect(getForegroundColor('#1a1a2e')).toBe('#FFFFFF');
  });

  it('returns black for light backgrounds', () => {
    expect(getForegroundColor('#FFFFFF')).toBe('#000000');
    expect(getForegroundColor('#f0f0f0')).toBe('#000000');
  });
});

describe('getProviderAvatarColor', () => {
  it('returns bg and fg for a given name', () => {
    const result = getProviderAvatarColor('My Provider');

    expect(result.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(result.fg).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('uses the first character for color generation', () => {
    const resultA = getProviderAvatarColor('Alpha');
    const resultB = getProviderAvatarColor('Beta');
    const resultA2 = getProviderAvatarColor('Apple');

    expect(resultA.bg).toBe(resultA2.bg);
    expect(resultA.bg).not.toBe(resultB.bg);
  });
});
