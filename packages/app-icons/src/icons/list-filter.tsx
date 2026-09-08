import { createDesktopIcon } from '../create-desktop-icon';
import { createIcon } from '../create-icon';

const Icon = createDesktopIcon([
  ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
  ['path', { d: 'M7 12h10', key: 'b7w52i' }],
  ['path', { d: 'M10 18h4', key: '1ulq68' }],
] as const);

export default createIcon(Icon, 'ListFilterIcon');
