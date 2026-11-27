import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['rect', { height: 7, key: 'grid-1', rx: 2.4, stroke: 'currentColor', width: 7, x: 3.5, y: 3.5 }],
  [
    'rect',
    { height: 7, key: 'grid-2', rx: 2.4, stroke: 'currentColor', width: 7, x: 13.5, y: 3.5 },
  ],
  [
    'rect',
    { height: 7, key: 'grid-3', rx: 2.4, stroke: 'currentColor', width: 7, x: 3.5, y: 13.5 },
  ],
  [
    'rect',
    { height: 7, key: 'grid-4', rx: 2.4, stroke: 'currentColor', width: 7, x: 13.5, y: 13.5 },
  ],
] as const);

export default createIcon(Icon, 'NavMoreIcon');
