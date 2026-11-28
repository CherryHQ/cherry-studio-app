import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 3.0 7.7 C 3.0 5.9 4.4 4.5 6.2 4.5 H 8.4 C 9.6 4.5 10.1 5.0 10.7 5.8 C 11.3 6.5 11.8 7.0 12.9 7.0 H 17.8 C 19.6 7.0 21.0 8.4 21.0 10.2 V 16.3 C 21.0 18.1 19.6 19.5 17.8 19.5 H 6.2 C 4.4 19.5 3.0 18.1 3.0 16.3 Z',
      key: 'folder',
      stroke: 'currentColor',
    },
  ],
  ['path', { d: 'M 3.2 10.2 H 20.8', key: 'flap-seam', stroke: 'currentColor' }],
] as const);

export default createIcon(Icon, 'NavFilesIcon');
