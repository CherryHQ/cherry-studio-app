import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M18 22H4a2 2 0 0 1-2-2V6', key: 'pblm9e' }],
  ['path', { d: 'm22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18', key: 'nf6bnh' }],
  ['circle', { cx: '12', cy: '8', r: '2', key: '1822b1' }],
  ['rect', { width: '16', height: '16', x: '6', y: '2', rx: '2', key: '12espp' }],
] as const);

export default createIcon(Icon, 'ImagesIcon');
