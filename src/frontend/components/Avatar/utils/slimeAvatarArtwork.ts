import type { SlimeAvatarParts } from '@/shared/data/types/agentAvatar';

export const SLIME_SHAPES: Record<SlimeAvatarParts['shape'], { eyeY: number; path: string }> = {
  round: {
    eyeY: 118,
    path: 'M24 136C24 83 55 42 100 42S176 83 176 136C176 158 150 165 100 165S24 158 24 136Z',
  },
  flat: {
    eyeY: 130,
    path: 'M18 142C18 105 53 75 100 75S182 105 182 142C182 159 150 166 100 166S18 159 18 142Z',
  },
  tall: {
    eyeY: 111,
    path: 'M40 142C40 88 56 29 100 29S160 88 160 142C160 161 140 168 100 168S40 161 40 142Z',
  },
  lean: {
    eyeY: 118,
    path: 'M24 138C24 100 48 61 88 47C134 30 165 64 174 114C184 156 154 166 103 166C57 166 24 160 24 138Z',
  },
  'soft-square': {
    eyeY: 115,
    path: 'M34 91C34 54 51 43 100 43S167 54 167 91V131C167 158 155 166 100 166S33 158 33 131Z',
  },
};

// Artwork colors stay constant across themes; the surrounding Avatar owns its frame.
export const SLIME_PALETTES: Record<
  SlimeAvatarParts['color'],
  { base: string; light: string; mid: string }
> = {
  rose: { light: '#F8B9D2', mid: '#E99ABC', base: '#D778A3' },
  apricot: { light: '#F8DB9E', mid: '#E8BD70', base: '#D5A254' },
  mint: { light: '#ADE8C7', mid: '#79C9AA', base: '#58AD90' },
  blue: { light: '#B0D0FA', mid: '#83B0EF', base: '#6496DC' },
  lilac: { light: '#D3BCF4', mid: '#B59BDE', base: '#9779C4' },
  peach: { light: '#F9C9B4', mid: '#EBAB91', base: '#D58C75' },
  teal: { light: '#A5D8D7', mid: '#70B2B3', base: '#519597' },
  slate: { light: '#B3BBC9', mid: '#8E98A8', base: '#6E7B8E' },
};
export const SLIME_EYE_COLOR = '#FFFDF8';

type EyePath = { d: string; strokeWidth?: number };

export const SLIME_EYES: Record<SlimeAvatarParts['eyes'], readonly EyePath[]> = {
  upright: [{ d: 'M-15-9V9M15-9V9', strokeWidth: 11 }],
  slant: [{ d: 'M-19 9L-11-9M11 9L19-9', strokeWidth: 11 }],
  slit: [{ d: 'M-27 0H-9M9 0H27', strokeWidth: 9 }],
  arch: [{ d: 'M-28 5Q-18-14-8 5M8 5Q18-14 28 5', strokeWidth: 8 }],
  rest: [{ d: 'M-28-5Q-18 14-8-5M8-5Q18 14 28-5', strokeWidth: 8 }],
  hollow: [
    {
      d: 'M-18-14A9 9 0 0 1-9-5V5A9 9 0 0 1-27 5V-5A9 9 0 0 1-18-14ZM18-14A9 9 0 0 1 27-5V5A9 9 0 0 1 9 5V-5A9 9 0 0 1 18-14Z',
      strokeWidth: 6,
    },
  ],
  wedge: [
    {
      d: 'M-29-9Q-34-13-31-5L-23 11Q-20 16-16 10L-10 1Q-8-2-13-4ZM29-9Q34-13 31-5L23 11Q20 16 16 10L10 1Q8-2 13-4Z',
    },
  ],
  wink: [
    { d: 'M-17-9V9', strokeWidth: 11 },
    { d: 'M9 2H27', strokeWidth: 9 },
  ],
};
