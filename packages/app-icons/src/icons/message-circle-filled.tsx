import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
      fill: 'currentColor',
      key: 'chat-filled',
      stroke: 'none',
    },
  ],
] as const);

export default createIcon(Icon, 'MessageCircleFilledIcon');
