import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';

const Icon = createFilledIcon([
  [
    'path',
    {
      d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM14.7 6.5a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm4 4a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm-11 2a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm2-5a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      key: 'palette-filled',
    },
  ],
] as const);

export default createIcon(Icon, 'PaletteFilledIcon');
