import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M6.2 3.5c.45 1.75 1.65 2.95 3.4 3.4-1.75.45-2.95 1.65-3.4 3.4-.45-1.75-1.65-2.95-3.4-3.4 1.75-.45 2.95-1.65 3.4-3.4Z',
      fill: 'currentColor',
      key: 'spark',
    },
  ],
  [
    'path',
    {
      d: 'M17.3 6.2a2.25 2.25 0 0 1 3.18 3.18l-9.2 9.2-5 1.82 1.82-5z',
      key: 'stylus',
      stroke: 'currentColor',
    },
  ],
] as const);

export default createIcon(Icon, 'SparkPenIcon');
