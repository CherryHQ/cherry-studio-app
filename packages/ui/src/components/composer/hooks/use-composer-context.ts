import { createContext, use } from 'react';

import type { ComposerLabels } from '../composer.types';

export type ComposerStateContextValue = {
  canSend: boolean;
  labels: ComposerLabels;
  streaming: boolean;
  value: string;
};

export type ComposerActionsContextValue = {
  changeText: (text: string) => void;
  send: () => void;
  stop?: () => void;
};

// Two contexts rather than one `{ state, actions }` object: `value` changes on
// every keystroke, and a single context would re-render every tool injected
// into the toolbar along with it. Tools that only act — open a menu, toggle a
// setting — subscribe to the actions half and stay put while the user types.
export const ComposerStateContext = createContext<ComposerStateContextValue | null>(null);
export const ComposerActionsContext = createContext<ComposerActionsContextValue | null>(null);

export function useComposerState(part: string): ComposerStateContextValue {
  const context = use(ComposerStateContext);

  if (!context) {
    throw new Error(`${part} must be rendered inside a Composer`);
  }

  return context;
}

export function useComposerActions(part: string): ComposerActionsContextValue {
  const context = use(ComposerActionsContext);

  if (!context) {
    throw new Error(`${part} must be rendered inside a Composer`);
  }

  return context;
}
