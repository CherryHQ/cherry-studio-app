import {
  createRandomSlimeAvatar,
  parseSlimeAvatar,
  SLIME_AVATAR_COLORS,
  SLIME_AVATAR_EYES,
  SLIME_AVATAR_SHAPES,
  SlimeAvatarSchema,
} from '../agentAvatar';

describe('slime avatar serialization', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads every supported shape, color, and eye combination independently', () => {
    for (const shape of SLIME_AVATAR_SHAPES) {
      for (const color of SLIME_AVATAR_COLORS) {
        for (const eyes of SLIME_AVATAR_EYES) {
          const value = `agent-avatar-slime:v1:${shape}:${color}:${eyes}`;
          expect(SlimeAvatarSchema.parse(value)).toBe(value);
          expect(parseSlimeAvatar(value)).toEqual({ color, eyes, shape });
        }
      }
    }
  });

  it.each([
    null,
    undefined,
    '',
    '🍒',
    'agent-avatar-file:a.webp',
    'agent-avatar-slime:v2:round:blue:slant',
    'agent-avatar-slime:v1:unknown:blue:slant',
    'agent-avatar-slime:v1:round:unknown:slant',
    'agent-avatar-slime:v1:round:blue:unknown',
    'agent-avatar-slime:v1:round:blue',
    'agent-avatar-slime:v1:round:blue:slant:extra',
    'agent-avatar-slime:v1:round:blue:slant\n',
  ])('leaves unsupported or malformed avatar %p to the legacy fallback', (value) => {
    expect(SlimeAvatarSchema.safeParse(value).success).toBe(false);
    expect(parseSlimeAvatar(value)).toBeNull();
  });

  it('chooses each part independently and generates anew on the next call', () => {
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.999999)
      .mockReturnValueOnce(0.999999)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.25);

    expect(createRandomSlimeAvatar()).toBe('agent-avatar-slime:v1:round:lilac:wink');
    expect(createRandomSlimeAvatar()).toBe('agent-avatar-slime:v1:soft-square:rose:slit');
  });
});
