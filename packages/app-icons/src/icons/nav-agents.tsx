import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['path', { d: 'M 8.6 3.0 L 9.0 5.3', key: 'ray-top', stroke: 'currentColor', strokeWidth: 2.1 }],
  ['path', { d: 'M 5.3 9.0 L 3.0 8.6', key: 'ray-left', stroke: 'currentColor', strokeWidth: 2.1 }],
  ['path', { d: 'M 4.1 4.1 L 5.8 5.8', key: 'ray-diag', stroke: 'currentColor', strokeWidth: 2.1 }],
  [
    'path',
    {
      d: 'M 10.8 9.0 L 18.9 12.2 Q 20.6 12.9 19.1 13.8 L 16.6 15.1 Q 15.5 15.5 15.1 16.6 L 13.8 19.1 Q 12.9 20.6 12.2 18.9 L 9.0 10.8 Q 8.2 8.2 10.8 9.0 Z',
      key: 'pointer',
      stroke: 'currentColor',
    },
  ],
] as const);

export default createIcon(Icon, 'NavAgentsIcon');
