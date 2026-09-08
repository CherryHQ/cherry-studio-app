import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M12 6v6l4 2', key: 'mmk7yg' }],
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
] as const);

export default createIcon(Icon, 'ClockIcon');
