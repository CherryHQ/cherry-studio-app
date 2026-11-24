import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  ['rect', { fill: 'currentColor', height: 6, key: 'node-right', rx: 1, width: 6, x: 16, y: 16 }],
  ['rect', { fill: 'currentColor', height: 6, key: 'node-left', rx: 1, width: 6, x: 2, y: 16 }],
  ['rect', { fill: 'currentColor', height: 6, key: 'node-top', rx: 1, width: 6, x: 9, y: 2 }],
  [
    'path',
    { d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3', key: 'branch-bus', stroke: 'currentColor' },
  ],
  ['path', { d: 'M12 12V8', key: 'branch-stem', stroke: 'currentColor' }],
] as const);

export default createIcon(Icon, 'NetworkFilledIcon');
