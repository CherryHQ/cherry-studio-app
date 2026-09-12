import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z', key: 'vv11sd' }],
  ['path', { d: 'M8 12h.01', key: 'czm47f' }],
  ['path', { d: 'M12 12h.01', key: '1mp3jc' }],
  ['path', { d: 'M16 12h.01', key: '1l6xoz' }],
] as const);

export default createIcon(Icon, 'MessageCircleMoreIcon');
