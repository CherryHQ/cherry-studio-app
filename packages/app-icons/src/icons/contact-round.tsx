import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M16 2v2', key: 'scm5qe' }],
  ['path', { d: 'M17.915 22a6 6 0 0 0-12 0', key: 'suqz9p' }],
  ['path', { d: 'M8 2v2', key: 'pbkmx' }],
  ['circle', { cx: '12', cy: '12', r: '4', key: '4exip2' }],
  ['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2', key: '12vinp' }],
] as const);

export default createIcon(Icon, 'ContactRoundIcon');
