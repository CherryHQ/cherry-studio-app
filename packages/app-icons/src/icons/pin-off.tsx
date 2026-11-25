import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M12 17v5', key: 'bb1du9' }],
  ['path', { d: 'M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89', key: '10142t' }],
  ['path', { d: 'm2 2 20 20', key: '1ooewy' }],
  [
    'path',
    {
      d: 'M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11',
      key: '15e0v4',
    },
  ],
] as const);

export default createIcon(Icon, 'PinOffIcon');
