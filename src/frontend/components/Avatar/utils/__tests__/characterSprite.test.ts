import type { AvatarCharacter } from '@/shared/contracts/avatars';

import { characterSprite } from '../characterSprite';

const layers = Object.fromEntries(
  ['idle', 'blink', 'thinking', 'waiting', 'done', 'error', 'tuft'].map((name) => [
    name,
    `file:///library/${name}.webp`,
  ]),
);
const rig = {
  frame: { center: { x: 256, y: 260 }, side: 480 },
  neck: { x: 256, y: 440 },
  sways: [],
};
const character = (withTuft: boolean): AvatarCharacter => ({
  id: '00000000-0000-4000-8000-000000000001',
  manifest: {
    version: 1,
    name: 'Fixture',
    size: 512,
    rig: withTuft ? { ...rig, tuft: { pivot: { x: 250, y: 40 } } } : rig,
  },
  layers,
});

test('maps a library character onto engine layers', () => {
  expect(characterSprite(character(true))).toMatchObject({
    rig: { size: 512, neck: { x: 256, y: 440 } },
    layers: {
      expressions: { thinking: 'file:///library/thinking.webp' },
      tuft: 'file:///library/tuft.webp',
    },
  });
});

test('the tuft layer is used only when the rig declares one', () => {
  expect(characterSprite(character(false)).layers.tuft).toBeUndefined();
});
