import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 5.4 3.6 H 14.2 C 15.8 3.6 17.0 4.7 17.1 6.3 V 7.1 H 14.4 C 12.7 7.1 11.7 8.1 11.7 9.8 V 15.2 H 5.4 C 3.7 15.2 2.5 14.0 2.5 12.3 V 6.5 C 2.5 4.8 3.7 3.6 5.4 3.6 Z M 5.2 5.9 A 0.7 0.7 0 0 0 4.5 6.6 V 12.1 A 0.7 0.7 0 0 0 5.2 12.8 H 11.7 V 9.8 C 11.7 8.1 12.7 7.1 14.4 7.1 H 15.1 V 6.6 A 0.7 0.7 0 0 0 14.4 5.9 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'laptop-screen-filled',
    },
  ],
  [
    'rect',
    {
      fill: 'currentColor',
      height: 2.1,
      key: 'laptop-base-filled',
      rx: 1.05,
      width: 9.4,
      x: 2.0,
      y: 17.0,
    },
  ],
  [
    'path',
    {
      d: 'M 15.8 8.7 H 19.0 C 20.5 8.7 21.6 9.8 21.6 11.3 V 17.5 C 21.6 19.0 20.5 20.1 19.0 20.1 H 15.8 C 14.3 20.1 13.2 19.0 13.2 17.5 V 11.3 C 13.2 9.8 14.3 8.7 15.8 8.7 Z M 16.4 16.9 A 0.7 0.7 0 0 0 16.4 18.3 H 18.4 A 0.7 0.7 0 0 0 18.4 16.9 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'phone-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavDevicesFilledIcon');
