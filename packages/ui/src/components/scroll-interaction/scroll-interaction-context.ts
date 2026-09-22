import { createContext, use } from 'react';

import type { ScrollInteraction } from './scroll-interaction';

export const ScrollInteractionContext = createContext<ScrollInteraction | null>(null);

/** Lets an enclosing gesture observe each scroll surface for exactly its mounted lifetime. */
export const ScrollInteractionObserverContext = createContext<
  ((interaction: ScrollInteraction) => () => void) | null
>(null);

export function useScrollInteraction() {
  return use(ScrollInteractionContext);
}
