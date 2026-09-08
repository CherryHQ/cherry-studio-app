import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  [
    'path',
    {
      d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
      key: '1lielz',
    },
  ],
  ['path', { d: 'M13 8H7', key: '14i4kc' }],
  ['path', { d: 'M17 12H7', key: '16if0g' }],
] as const);

export default createIcon(Icon, 'MessageSquareTextIcon');
