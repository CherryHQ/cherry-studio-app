import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 3.8 10.8 C 3.8 8.9 4.9 7.8 6.8 7.8 H 7.4 C 8.15 7.8 8.25 7.25 7.85 6.55 C 7.2 5.45 7.95 3.4 9.9 3.4 C 11.85 3.4 12.6 5.45 11.95 6.55 C 11.55 7.25 11.65 7.8 12.4 7.8 H 13.0 C 14.9 7.8 16.0 8.9 16.0 10.8 V 11.4 C 16.0 12.15 16.55 12.25 17.25 11.85 C 18.35 11.2 20.4 11.95 20.4 13.9 C 20.4 15.85 18.35 16.6 17.25 15.95 C 16.55 15.55 16.0 15.65 16.0 16.4 V 17.0 C 16.0 18.9 14.9 20.0 13.0 20.0 H 6.8 C 4.9 20.0 3.8 18.9 3.8 17.0 V 16.2 C 3.8 15.55 4.35 15.45 4.95 15.8 C 5.9 16.35 7.15 15.5 7.15 13.9 C 7.15 12.3 5.9 11.45 4.95 12.0 C 4.35 12.35 3.8 12.25 3.8 11.6 Z',
      key: 'puzzle',
      stroke: 'currentColor',
    },
  ],
] as const);

export default createIcon(Icon, 'NavPluginsIcon');
