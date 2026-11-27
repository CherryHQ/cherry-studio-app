import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 6.0 3.8 H 18.0 C 18.95 3.8 19.75 4.35 20.05 5.25 L 21.0 8.2 C 21.0 10.1 19.6 11.2 18.0 11.2 C 16.4 11.2 15.0 10.1 15.0 8.5 C 15.0 10.1 13.6 11.2 12.0 11.2 C 10.4 11.2 9.0 10.1 9.0 8.5 C 9.0 10.1 7.6 11.2 6.0 11.2 C 4.4 11.2 3.0 10.1 3.0 8.2 L 3.95 5.25 C 4.25 4.35 5.05 3.8 6.0 3.8 Z',
      key: 'awning',
      stroke: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M 4.5 11.0 V 17.4 C 4.5 19.0 5.7 20.2 7.3 20.2 H 16.7 C 18.3 20.2 19.5 19.0 19.5 17.4 V 11.0',
      key: 'store-body',
      stroke: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M 9.8 20.2 V 16.6 A 2.2 2.2 0 0 1 14.2 16.6 V 20.2',
      key: 'store-door',
      stroke: 'currentColor',
    },
  ],
] as const);

export default createIcon(Icon, 'NavMarketplaceIcon');
