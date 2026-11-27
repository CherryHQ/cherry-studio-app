import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 2.5 7.6 C 2.5 5.6 4.1 4.0 6.1 4.0 H 8.4 C 9.7 4.0 10.2 4.55 10.85 5.4 C 11.45 6.15 11.95 6.6 13.1 6.6 H 17.9 C 19.9 6.6 21.5 8.2 21.5 10.2 V 16.4 C 21.5 18.4 19.9 20.0 17.9 20.0 H 6.1 C 4.1 20.0 2.5 18.4 2.5 16.4 Z M 4.4 9.5 H 19.6 A 0.75 0.75 0 0 1 19.6 11.0 H 4.4 A 0.75 0.75 0 0 1 4.4 9.5 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'folder-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavFilesFilledIcon');
