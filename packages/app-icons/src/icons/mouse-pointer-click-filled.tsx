import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['path', { d: 'M14 4.1 12 6', key: 'spark-1', stroke: 'currentColor' }],
  ['path', { d: 'm5.1 8-2.9-.8', key: 'spark-2', stroke: 'currentColor' }],
  ['path', { d: 'm6 12-1.9 2', key: 'spark-3', stroke: 'currentColor' }],
  ['path', { d: 'M7.2 2.2 8 5.1', key: 'spark-4', stroke: 'currentColor' }],
  [
    'path',
    {
      d: 'M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z',
      fill: 'currentColor',
      key: 'pointer',
      stroke: 'currentColor',
    },
  ],
] as const);

export default createIcon(Icon, 'MousePointerClickFilledIcon');
