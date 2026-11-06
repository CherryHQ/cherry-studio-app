import { AnchoredInfoPopover, type InfoPopoverAnchor } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v7 as uuidv7 } from 'uuid';

import { useComposerActions, useComposerMeta } from '@/frontend/components/Composer';
import { MessageSelectionActionProvider } from '@/frontend/components/Message';
import type { MessageQuote, QuoteFields } from '@/shared/contracts/agent';

import {
  Actions,
  Highlight,
  type ChatQuoteActions,
  type QuoteAttempt,
  type QuoteState,
  State,
} from './ChatQuoteContext';
import { createQuoteMentionLabel, readQuoteMentions } from './quoteMentions';

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
  const { subscribeDraftEdits } = useComposerActions();
  const [state, setState] = useState<QuoteState>({ fields: {}, isBusy: false });
  const [preview, setPreview] = useState<{
    anchor: InfoPopoverAnchor;
    text: string;
    caption: string;
  }>();
  const current = useRef(state);
  const mounted = useRef(true);
  const focusFrame = useRef<number | undefined>(undefined);
  const locked = useRef(false);
  useEffect(() => subscribeDraftEdits(() => setPreview(undefined)), [subscribeDraftEdits]);
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
    if (!locked.current) {
      setPreview(undefined);
      update({ fields: {}, isBusy: false });
    }
  }, [update]);
  const restoreQuote = useCallback(
    ({ quotes, quoteAuthor }: QuoteFields) => {
      if (!locked.current)
        update({ fields: quotes && quoteAuthor ? { quotes, quoteAuthor } : {}, isBusy: false });
    },
    [update],
  );
  const quoteSelection = useCallback(
    ({ messageId, text }: { messageId: string; text: string }) => {
      if (locked.current || !text.trim()) return;
      const quote: MessageQuote = { id: uuidv7(), sourceMessageId: messageId, text };
      update({
        fields: {
          quotes: [...(current.current.fields.quotes ?? []), quote],
          quoteAuthor: { role: 'assistant', ...(authorName ? { name: authorName } : {}) },
        },
        isBusy: false,
      });
      // The native selection menu dismisses after this callback; focus once it has gone.
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = undefined;
        if (mounted.current && !locked.current) {
          inputRef.current?.focus();
          inputRef.current?.insertLink(createQuoteMentionLabel(text), `quote://${quote.id}`);
          inputRef.current?.insertText(' ');
        }
      });
    },
    [authorName, inputRef, update],
  );
  const capture = useCallback(
    (draft: string): QuoteAttempt => {
      if (locked.current || current.current.isBusy)
        throw new Error('Quote admission is already pending.');
      locked.current = true;
      const previousFields = current.current.fields;
      const { quotes } = readQuoteMentions(draft, previousFields.quotes);
      const fields: QuoteFields = quotes.length
        ? { quotes, quoteAuthor: previousFields.quoteAuthor }
        : {};
      setPreview(undefined);
      update({ ...current.current, isBusy: Boolean(fields.quotes) });
      let finished = false;
      return {
        fields,
        finish(accepted) {
          if (finished) return;
          finished = true;
          locked.current = false;
          if (!mounted.current) return;
          update({ fields: accepted ? {} : previousFields, isBusy: false });
        },
      };
    },
    [update],
  );
  const previewQuote = useCallback<ChatQuoteActions['previewQuote']>(
    ({ url, ...anchor }) => {
      if (!mounted.current || locked.current || !url.startsWith('quote://')) return;
      const quote = current.current.fields.quotes?.find(
        (item) => item.id === url.slice('quote://'.length),
      );
      if (quote)
        setPreview({
          anchor,
          text: quote.text,
          caption: current.current.fields.quoteAuthor?.name ?? t('chat.quote.assistant'),
        });
    },
    [t],
  );
  const actions = useMemo(
    () => ({ clearQuote, restoreQuote, capture, openQuote, previewQuote }),
    [clearQuote, restoreQuote, capture, openQuote, previewQuote],
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
            <AnchoredInfoPopover
              anchor={preview?.anchor}
              caption={preview?.caption}
              text={preview?.text ?? ''}
              onClose={() => setPreview(undefined)}
              testID="chat-quote-preview"
            />
          </MessageSelectionActionProvider>
        </Highlight>
      </State>
    </Actions>
  );
}
