import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M18 20a6 6 0 0 0-12 0', key: '1qehca' }],
  ['circle', { cx: '12', cy: '10', r: '4', key: '1h16sb' }],
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
] as const);

export default createIcon(Icon, 'CircleUserRoundIcon');
