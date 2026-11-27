import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M 9 3.4 H 15 C 19.0 3.4 21.6 6.0 21.6 10 V 12 C 21.6 16.0 19.0 18.6 15 18.6 H 9.6 C 7.7 20.0 5.8 20.8 4.0 20.95 C 3.1 21.02 2.68 20.32 3.12 19.55 C 3.72 18.5 3.92 17.45 3.68 16.45 C 2.95 15.15 2.4 13.65 2.4 12 V 10 C 2.4 6.0 5.0 3.4 9 3.4 Z M 8.2 9.75 A 1.25 1.25 0 1 0 8.2 12.25 A 1.25 1.25 0 1 0 8.2 9.75 Z M 12 9.75 A 1.25 1.25 0 1 0 12 12.25 A 1.25 1.25 0 1 0 12 9.75 Z M 15.8 9.75 A 1.25 1.25 0 1 0 15.8 12.25 A 1.25 1.25 0 1 0 15.8 9.75 Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'bubble-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'NavChatFilledIcon');
