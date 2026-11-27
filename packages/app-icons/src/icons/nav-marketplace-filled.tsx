import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 5.6 3.2 H 18.4 C 19.5 3.2 20.4 3.85 20.75 4.85 L 21.6 7.8 C 21.6 9.85 20.0 11.0 18.2 11.0 C 16.65 11.0 15.4 10.1 15.0 8.9 C 14.6 10.1 13.35 11.0 12.0 11.0 C 10.65 11.0 9.4 10.1 9.0 8.9 C 8.6 10.1 7.35 11.0 5.8 11.0 C 4.0 11.0 2.4 9.85 2.4 7.8 L 3.25 4.85 C 3.6 3.85 4.5 3.2 5.6 3.2 Z',
      fill: 'currentColor',
      key: 'awning-filled',
    },
  ],
  [
    'path',
    {
      d: 'M 4.0 12.5 H 20.0 V 17.5 C 20.0 19.3 18.6 20.7 16.8 20.7 H 7.2 C 5.4 20.7 4.0 19.3 4.0 17.5 V 12.5 Z M 9.6 20.7 V 16.8 A 2.4 2.4 0 0 1 14.4 16.8 V 20.7 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'store-body-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavMarketplaceFilledIcon');
