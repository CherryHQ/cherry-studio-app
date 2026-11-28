import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 3.2 10.7 C 3.2 8.6 4.5 7.3 6.6 7.3 H 7.3 C 8.0 7.3 8.05 6.8 7.65 6.05 C 6.95 4.8 7.8 2.7 9.9 2.7 C 12.0 2.7 12.85 4.8 12.15 6.05 C 11.75 6.8 11.8 7.3 12.5 7.3 H 13.2 C 15.3 7.3 16.6 8.6 16.6 10.7 V 11.3 C 16.6 12.0 17.1 12.05 17.85 11.65 C 19.1 10.95 21.2 11.8 21.2 13.9 C 21.2 16.0 19.1 16.85 17.85 16.15 C 17.1 15.75 16.6 15.8 16.6 16.5 V 17.1 C 16.6 19.2 15.3 20.5 13.2 20.5 H 6.6 C 4.5 20.5 3.2 19.2 3.2 17.1 V 16.3 C 3.2 15.65 3.8 15.55 4.45 15.9 C 5.55 16.5 6.85 15.6 6.85 13.9 C 6.85 12.2 5.55 11.3 4.45 11.9 C 3.8 12.25 3.2 12.15 3.2 11.5 Z',
      fill: 'currentColor',
      key: 'puzzle-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavPluginsFilledIcon');
