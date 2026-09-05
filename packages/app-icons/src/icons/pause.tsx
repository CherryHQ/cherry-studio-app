import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1', key: 'zuxfzm' }],
  ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1', key: '1okwgv' }],
] as const);

export default createIcon(Icon, 'PauseIcon');
