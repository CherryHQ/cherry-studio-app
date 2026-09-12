import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['polygon', { points: '6 3 20 12 6 21 6 3', key: '1oa8hb' }],
] as const);

export default createIcon(Icon, 'PlayIcon');
