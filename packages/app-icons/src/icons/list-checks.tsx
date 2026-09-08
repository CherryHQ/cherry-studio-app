import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'm3 17 2 2 4-4', key: '1jhpwq' }],
  ['path', { d: 'm3 7 2 2 4-4', key: '1obspn' }],
  ['path', { d: 'M13 6h8', key: '15sg57' }],
  ['path', { d: 'M13 12h8', key: 'h98zly' }],
  ['path', { d: 'M13 18h8', key: 'oe0vm4' }],
] as const);

export default createIcon(Icon, 'ListChecksIcon');
