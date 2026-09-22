import { createContext } from 'react';

import type { createBackgroundPressInteraction } from './background-press-interaction';

export const BackgroundPressContext = createContext<ReturnType<
  typeof createBackgroundPressInteraction
> | null>(null);
