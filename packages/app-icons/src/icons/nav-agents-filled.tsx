import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['path', { d: 'M 8.5 2.7 L 9.0 5.1', key: 'ray-top', stroke: 'currentColor', strokeWidth: 2.2 }],
  ['path', { d: 'M 5.1 9.0 L 2.7 8.5', key: 'ray-left', stroke: 'currentColor', strokeWidth: 2.2 }],
  ['path', { d: 'M 3.9 3.9 L 5.7 5.7', key: 'ray-diag', stroke: 'currentColor', strokeWidth: 2.2 }],
  [
    'path',
    {
      d: 'M 10.6 8.3 L 19.5 11.9 Q 21.4 12.75 19.6 13.8 L 16.85 15.25 Q 15.7 15.7 15.25 16.85 L 13.8 19.6 Q 12.75 21.4 11.9 19.5 L 8.3 10.6 Q 7.45 7.45 10.6 8.3 Z',
      fill: 'currentColor',
      key: 'pointer-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavAgentsFilledIcon');
