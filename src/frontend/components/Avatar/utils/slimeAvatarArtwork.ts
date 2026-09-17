import type { SlimeAvatarParts } from '@/shared/data/types/agentAvatar';

export const SLIME_SHAPES: Record<SlimeAvatarParts['shape'], { eyeY: number; path: string }> = {
  round: {
    eyeY: 111,
    path: 'M25 160C14 146 18 126 24 109C32 83 34 53 57 33C78 14 111 14 133 29C158 46 168 76 175 104C182 127 194 148 181 164C169 180 135 175 111 180C82 184 40 181 25 160Z',
  },
  flat: {
    eyeY: 126,
    path: 'M13 155C6 139 19 120 30 109C43 96 43 71 68 61C91 51 113 63 130 69C153 77 167 94 179 116C190 136 197 150 187 166C179 180 154 176 136 180C106 188 83 178 64 181C40 184 19 176 13 155Z',
  },
  tall: {
    eyeY: 104,
    path: 'M40 166C27 156 36 132 40 111C44 87 42 49 62 28C78 11 101 12 118 26C144 47 148 72 155 106C164 131 179 153 167 168C158 182 137 178 114 181C84 185 53 180 40 166Z',
  },
  lean: {
    eyeY: 111,
    path: 'M22 157C10 138 20 112 32 90C46 65 65 43 91 35C122 25 145 36 154 58C164 80 158 100 170 120C184 140 195 155 183 169C170 183 144 175 120 181C86 190 42 180 22 157Z',
  },
  'soft-square': {
    eyeY: 108,
    path: 'M23 151C17 132 20 111 22 91C24 64 30 40 52 33C77 24 101 35 123 31C147 26 170 39 177 62C184 85 178 110 183 132C188 153 178 168 159 174C138 181 119 175 98 180C70 186 33 180 23 151Z',
  },
};

// Artwork colors stay constant across themes. Clearer midtones separate the white eyes
// from the body without adding outlines, pupils, or another background surface.
export const SLIME_PALETTES: Record<
  SlimeAvatarParts['color'],
  { base: string; light: string; mid: string }
> = {
  rose: { light: '#F7A8C3', mid: '#E574A5', base: '#CD5A91' },
  apricot: { light: '#FFCA7C', mid: '#E99045', base: '#CE6D2F' },
  mint: { light: '#A9E6C9', mid: '#5FB998', base: '#359777' },
  blue: { light: '#B0D4FF', mid: '#6BA4EE', base: '#477ED1' },
  lilac: { light: '#D0B6F6', mid: '#A284DB', base: '#8163C0' },
  peach: { light: '#FFBEA6', mid: '#EC947D', base: '#CD705E' },
  teal: { light: '#A3DFDB', mid: '#59B6B1', base: '#35918E' },
  slate: { light: '#B9C8DC', mid: '#8B9DB9', base: '#667C9C' },
};
export const SLIME_EYE_COLOR = '#FFFDF8';

type EyePath = { d: string; strokeWidth?: number };

export const SLIME_EYES: Record<SlimeAvatarParts['eyes'], readonly EyePath[]> = {
  upright: [{ d: 'M-23-10V10M23-10V10', strokeWidth: 14 }],
  slant: [{ d: 'M-28 10L-20-10M18 10L26-10', strokeWidth: 14 }],
  slit: [{ d: 'M-34 1L-14-1M14-1L34 1', strokeWidth: 10 }],
  arch: [{ d: 'M-35 5Q-23-15-11 5M11 5Q23-15 35 5', strokeWidth: 10 }],
  rest: [{ d: 'M-35-5Q-23 15-11-5M11-5Q23 15 35-5', strokeWidth: 10 }],
  hollow: [
    {
      d: 'M-23-15A9 9 0 0 1-14-6V6A9 9 0 0 1-32 6V-6A9 9 0 0 1-23-15ZM23-15A9 9 0 0 1 32-6V6A9 9 0 0 1 14 6V-6A9 9 0 0 1 23-15Z',
      strokeWidth: 7,
    },
  ],
  wedge: [
    {
      d: 'M-35-12Q-29-16-24-11L-12 1Q-8 7-13 11Q-17 15-23 10L-36-2Q-41-7-35-12ZM35-12Q29-16 24-11L12 1Q8 7 13 11Q17 15 23 10L36-2Q41-7 35-12Z',
    },
  ],
  wink: [
    { d: 'M-24-11V11', strokeWidth: 14 },
    { d: 'M12 5Q24-15 36 5', strokeWidth: 10 },
  ],
};
