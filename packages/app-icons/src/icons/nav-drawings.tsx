import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 12 3.3 C 17.1 3.3 20.8 6.8 20.8 11.4 C 20.8 14.3 18.7 15.8 16.0 15.8 H 14.8 C 13.4 15.8 12.6 16.7 13.0 17.9 C 13.45 19.35 12.55 20.7 10.9 20.7 C 6.2 20.7 3.2 16.9 3.2 12.0 C 3.2 7.1 6.9 3.3 12 3.3 Z',
      key: 'palette',
      stroke: 'currentColor',
    },
  ],
  ['circle', { cx: 8.5, cy: 8.4, fill: 'currentColor', key: 'well-1', r: 1.15 }],
  ['circle', { cx: 13.2, cy: 7.3, fill: 'currentColor', key: 'well-2', r: 1.15 }],
  ['circle', { cx: 16.7, cy: 10.6, fill: 'currentColor', key: 'well-3', r: 1.15 }],
  ['circle', { cx: 7.5, cy: 13.2, fill: 'currentColor', key: 'well-4', r: 1.15 }],
] as const);

export default createIcon(Icon, 'NavDrawingsIcon');
