import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M21 14h-5', key: '1vh23k' }],
  ['path', { d: 'M16 16v-3.5a2.5 2.5 0 0 1 5 0V16', key: '1wh10o' }],
  ['path', { d: 'M4.5 13h6', key: 'dfilno' }],
  ['path', { d: 'm3 16 4.5-9 4.5 9', key: '2dxa0e' }],
] as const);

export default createIcon(Icon, 'ALargeSmallIcon');
