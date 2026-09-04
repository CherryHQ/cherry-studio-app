import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M4 12h16', key: '1lakjw' }],
  ['path', { d: 'M4 18h16', key: '19g7jn' }],
  ['path', { d: 'M4 6h16', key: '1o0s65' }],
] as const);

export default createIcon(Icon, 'MenuIcon');
