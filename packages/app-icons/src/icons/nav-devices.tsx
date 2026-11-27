import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 11.2 14.6 H 5.4 C 4.0 14.6 3.0 13.6 3.0 12.2 V 6.6 C 3.0 5.2 4.0 4.2 5.4 4.2 H 14.2 C 15.6 4.2 16.6 5.2 16.6 6.6',
      key: 'laptop-screen',
      stroke: 'currentColor',
    },
  ],
  ['path', { d: 'M 2.6 17.8 H 10.8', key: 'laptop-base', stroke: 'currentColor' }],
  [
    'rect',
    {
      height: 10.8,
      key: 'phone',
      rx: 2.3,
      stroke: 'currentColor',
      width: 7.2,
      x: 13.8,
      y: 8.8,
    },
  ],
] as const);

export default createIcon(Icon, 'NavDevicesIcon');
