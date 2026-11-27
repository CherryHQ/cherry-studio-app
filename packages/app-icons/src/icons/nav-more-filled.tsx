import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'rect',
    { fill: 'currentColor', height: 7.9, key: 'grid-1', rx: 2.75, width: 7.9, x: 3.1, y: 3.1 },
  ],
  [
    'rect',
    { fill: 'currentColor', height: 7.9, key: 'grid-2', rx: 2.75, width: 7.9, x: 13.0, y: 3.1 },
  ],
  [
    'rect',
    { fill: 'currentColor', height: 7.9, key: 'grid-3', rx: 2.75, width: 7.9, x: 3.1, y: 13.0 },
  ],
  [
    'rect',
    { fill: 'currentColor', height: 7.9, key: 'grid-4', rx: 2.75, width: 7.9, x: 13.0, y: 13.0 },
  ],
] as const);

export default createIcon(Icon, 'NavMoreFilledIcon');
