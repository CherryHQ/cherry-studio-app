import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const bubble = {
  d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  key: 'bubble',
  stroke: 'currentColor',
} as const;
const strokeWidth = 1.6;

export default createIcon(createFilledIcon([['path', bubble]], { strokeWidth }), 'NavChatIcon');

export const NavChatFilledIcon = createIcon(
  createFilledIcon([['path', { ...bubble, fill: 'currentColor' }]], {
    strokeWidth,
    viewBoxPadding: 1,
  }),
  'NavChatFilledIcon',
);
