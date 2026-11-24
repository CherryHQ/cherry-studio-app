import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42ZM12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3ZM7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
      fill: 'currentColor',
      fillOpacity: 0.24,
      key: 'boxes-body',
      stroke: 'currentColor',
    },
  ],
  ['path', { d: 'm7 16.5-4.74-2.85', key: 'edge-1', stroke: 'currentColor' }],
  ['path', { d: 'm7 16.5 5-3', key: 'edge-2', stroke: 'currentColor' }],
  ['path', { d: 'M7 16.5v5.17', key: 'edge-3', stroke: 'currentColor' }],
  ['path', { d: 'm17 16.5-5-3', key: 'edge-4', stroke: 'currentColor' }],
  ['path', { d: 'm17 16.5 4.74-2.85', key: 'edge-5', stroke: 'currentColor' }],
  ['path', { d: 'M17 16.5v5.17', key: 'edge-6', stroke: 'currentColor' }],
  ['path', { d: 'M12 8 7.26 5.15', key: 'edge-7', stroke: 'currentColor' }],
  ['path', { d: 'm12 8 4.74-2.85', key: 'edge-8', stroke: 'currentColor' }],
  ['path', { d: 'M12 13.5V8', key: 'edge-9', stroke: 'currentColor' }],
] as const);

export default createIcon(Icon, 'BoxesFilledIcon');
