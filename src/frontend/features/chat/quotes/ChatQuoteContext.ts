import { createContext, use } from 'react';

import type { QuoteFields } from '@/shared/contracts/agent';

import type { QuoteNavigationOutcome } from './useChatQuoteNavigation';
export type QuoteAttempt = { fields: QuoteFields; finish: (accepted: boolean) => void };
export type ChatQuoteActions = {
  clearQuote: () => void;
  openQuote: (input: {
    sourceMessageId: string;
    requestId: string;
  }) => Promise<QuoteNavigationOutcome>;
  capture: () => QuoteAttempt;
};
export type QuoteState = { fields: QuoteFields; isBusy: boolean };
export const Actions = createContext<ChatQuoteActions | undefined>(undefined);
export const State = createContext<QuoteState>({ fields: {}, isBusy: false });
export const Highlight = createContext<string | undefined>(undefined);

export function useChatQuoteActions() {
  return use(Actions);
}
export function useChatQuoteState() {
  return use(State);
}
export function useChatQuoteHighlight() {
  return use(Highlight);
}
