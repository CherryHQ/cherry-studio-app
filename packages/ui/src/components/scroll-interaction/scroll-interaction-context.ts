import { createContext, use } from 'react';

import type { ScrollInteraction } from './scroll-interaction';

export const ScrollInteractionContext = createContext<ScrollInteraction | null>(null);

export function useScrollInteraction() {
  return use(ScrollInteractionContext);
}
