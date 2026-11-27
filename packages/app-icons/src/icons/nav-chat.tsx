import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 9 4 H 15 C 18.6 4 21 6.4 21 10 V 12 C 21 15.6 18.6 18 15 18 H 9.5 C 7.7 19.35 5.9 20.15 4.2 20.28 C 3.42 20.34 3.04 19.72 3.42 19.04 C 3.96 18.08 4.16 17.12 3.96 16.18 C 3.34 14.98 3 13.56 3 12 V 10 C 3 6.4 5.4 4 9 4 Z',
      key: 'bubble',
      stroke: 'currentColor',
    },
  ],
  ['circle', { cx: 8.4, cy: 11, fill: 'currentColor', key: 'dot-1', r: 1.05 }],
  ['circle', { cx: 12, cy: 11, fill: 'currentColor', key: 'dot-2', r: 1.05 }],
  ['circle', { cx: 15.6, cy: 11, fill: 'currentColor', key: 'dot-3', r: 1.05 }],
] as const);

export default createIcon(Icon, 'NavChatIcon');
