import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['rect', { width: '7', height: '7', x: '3', y: '3', rx: '1', key: '1g98yp' }],
  ['rect', { width: '7', height: '7', x: '14', y: '3', rx: '1', key: '6d4x95' }],
  ['rect', { width: '7', height: '7', x: '14', y: '14', rx: '1', key: 'nxv5o0' }],
  ['rect', { width: '7', height: '7', x: '3', y: '14', rx: '1', key: '12ebd6' }],
] as const);

export default createIcon(Icon, 'LayoutGridIcon');
