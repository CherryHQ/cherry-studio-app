import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M8 2v4', key: '1cmpym' }],
  ['path', { d: 'M16 2v4', key: '4m81vk' }],
  ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2', key: '1hopcy' }],
  ['path', { d: 'M3 10h18', key: '8toen8' }],
] as const);

export default createIcon(Icon, 'CalendarIcon');
