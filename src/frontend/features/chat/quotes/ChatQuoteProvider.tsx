import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v7 as uuidv7 } from 'uuid';

import { useComposerMeta } from '@/frontend/components/Composer';
import { MessageSelectionActionProvider } from '@/frontend/components/Message';

import {
  Actions,
  Highlight,
  type ChatQuoteActions,
  type QuoteAttempt,
  type QuoteState,
  State,
} from './ChatQuoteContext';

/** Quotes text selected in an answer into this composer session's next message. */
export function ChatQuoteProvider({
  children,
  sessionId,
  enabled,
  authorName,
  openQuote,
  highlight,
}: PropsWithChildren<{
  sessionId?: string;
  enabled: boolean;
  authorName?: string;
  openQuote: ChatQuoteActions['openQuote'];
  highlight?: string;
}>) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const [state, setState] = useState<QuoteState>({ fields: {}, isBusy: false });
  const current = useRef(state);
  const mounted = useRef(true);
  const focusFrame = useRef<number | undefined>(undefined);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  const update = useCallback((value: QuoteState) => {
    current.current = value;
    if (mounted.current) setState(value);
  }, []);
  const clearQuote = useCallback(() => {
    if (!locked.current) update({ fields: {}, isBusy: false });
  }, [update]);
  const quoteSelection = useCallback(
    ({ messageId, text }: { messageId: string; text: string }) => {
      if (locked.current || !text.trim()) return;
      update({
        fields: {
          quotes: [{ id: uuidv7(), sourceMessageId: messageId, text }],
          quoteAuthor: { role: 'assistant', ...(authorName ? { name: authorName } : {}) },
        },
        isBusy: false,
      });
      // The native selection menu dismisses after this callback; focus once it has gone.
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = undefined;
        if (mounted.current) inputRef.current?.focus();
      });
    },
    [authorName, inputRef, update],
  );
  const capture = useCallback((): QuoteAttempt => {
    if (locked.current || current.current.isBusy)
      throw new Error('Quote admission is already pending.');
    locked.current = true;
    const fields = current.current.fields;
    update({ ...current.current, isBusy: Boolean(fields.quotes) });
    let finished = false;
    return {
      fields,
      finish(accepted) {
        if (finished) return;
        finished = true;
        locked.current = false;
        if (!mounted.current) return;
        update({ fields: accepted ? {} : fields, isBusy: false });
      },
    };
  }, [update]);
  const actions = useMemo(
    () => ({ clearQuote, capture, openQuote }),
    [clearQuote, capture, openQuote],
  );
  const selectionAction = useMemo(
    () =>
      enabled && sessionId ? { label: t('chat.quote.action'), onPress: quoteSelection } : undefined,
    [enabled, quoteSelection, sessionId, t],
  );
  return (
    <Actions value={actions}>
      <State value={state}>
        <Highlight value={highlight}>
          <MessageSelectionActionProvider action={selectionAction}>
            {children}
          </MessageSelectionActionProvider>
        </Highlight>
      </State>
    </Actions>
  );
}
