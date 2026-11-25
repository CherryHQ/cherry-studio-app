import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['rect', { fill: 'currentColor', height: 7, key: 'grid-1', rx: 1.5, width: 7, x: 3, y: 3 }],
  ['rect', { fill: 'currentColor', height: 7, key: 'grid-2', rx: 1.5, width: 7, x: 14, y: 3 }],
  ['rect', { fill: 'currentColor', height: 7, key: 'grid-3', rx: 1.5, width: 7, x: 14, y: 14 }],
  ['rect', { fill: 'currentColor', height: 7, key: 'grid-4', rx: 1.5, width: 7, x: 3, y: 14 }],
] as const);

export default createIcon(Icon, 'LayoutGridFilledIcon');
