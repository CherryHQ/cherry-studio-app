import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 12 2.7 C 17.5 2.7 21.4 6.5 21.4 11.4 C 21.4 14.7 19.0 16.4 16.1 16.4 H 14.8 C 13.7 16.4 13.1 17.1 13.45 18.1 C 13.95 19.7 12.95 21.3 10.9 21.3 C 5.8 21.3 2.6 17.2 2.6 12.0 C 2.6 6.8 6.5 2.7 12 2.7 Z M 8.5 7.0 A 1.35 1.35 0 1 0 8.5 9.7 A 1.35 1.35 0 1 0 8.5 7.0 Z M 13.2 5.9 A 1.35 1.35 0 1 0 13.2 8.6 A 1.35 1.35 0 1 0 13.2 5.9 Z M 16.8 9.2 A 1.35 1.35 0 1 0 16.8 11.9 A 1.35 1.35 0 1 0 16.8 9.2 Z M 7.5 11.8 A 1.35 1.35 0 1 0 7.5 14.5 A 1.35 1.35 0 1 0 7.5 11.8 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'palette-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavDrawingsFilledIcon');
