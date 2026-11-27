import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const rays = [
  ['path', { d: 'M14 4.1 12 6', key: 'ray-top-right', stroke: 'currentColor' }],
  ['path', { d: 'm5.1 8-2.9-.8', key: 'ray-left', stroke: 'currentColor' }],
  ['path', { d: 'm6 12-1.9 2', key: 'ray-bottom-left', stroke: 'currentColor' }],
  ['path', { d: 'M7.2 2.2 8 5.1', key: 'ray-top-left', stroke: 'currentColor' }],
] as const;
const pointer = {
  d: 'M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z',
  key: 'pointer',
  stroke: 'currentColor',
} as const;
const strokeWidth = 1.6;

export default createIcon(
  createFilledIcon([...rays, ['path', pointer]], { strokeWidth }),
  'NavAgentsIcon',
);

export const NavAgentsFilledIcon = createIcon(
  createFilledIcon([...rays, ['path', { ...pointer, fill: 'currentColor' }]], {
    strokeWidth,
    viewBoxPadding: 1,
  }),
  'NavAgentsFilledIcon',
);
