import { AnchoredInfoPopover, type InfoPopoverAnchor } from '@cherrystudio/ui/components';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { v7 as uuidv7 } from 'uuid';

import { useComposerActions, useComposerMeta } from '@/frontend/components/Composer';
import { createComposerValue } from '@/frontend/components/Composer/ComposerDraft';
import { MessageSelectionActionProvider } from '@/frontend/components/Message';
import { useNextFrame } from '@/frontend/hooks/useNextFrame';
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
  store,
  enabled,
  authorName,
  openQuote,
  highlight,
}: PropsWithChildren<{
  sessionId?: string;
  store?: ReturnType<typeof createComposerValue<QuoteState>>;
  enabled: boolean;
  authorName?: string;
  openQuote: ChatQuoteActions['openQuote'];
  highlight?: string;
}>) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const { subscribeDraftEdits } = useComposerActions();
  const [quoteState] = useState(
    () => store ?? createComposerValue<QuoteState>({ fields: {}, isBusy: false }),
  );
  const state = useSyncExternalStore(quoteState.subscribe, quoteState.get, quoteState.get);
  const update = quoteState.set;
  const [preview, setPreview] = useState<{
    anchor: InfoPopoverAnchor;
    text: string;
    caption: string;
  }>();
  const mounted = useRef(true);
  const { schedule: scheduleFocusFrame } = useNextFrame();
  useEffect(() => subscribeDraftEdits(() => setPreview(undefined)), [subscribeDraftEdits]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const clearQuote = useCallback(() => {
    if (!quoteState.get().isBusy) {
      setPreview(undefined);
      update({ fields: {}, isBusy: false });
    }
  }, [quoteState, update]);
  const restoreQuote = useCallback(
    (fields: QuoteFields) => {
      if (!quoteState.get().isBusy)
        update({ fields: fields.quotes && fields.quoteAuthor ? fields : {}, isBusy: false });
    },
    [quoteState, update],
  );
  const quoteSelection = useCallback(
    ({ messageId, text }: { messageId: string; text: string }) => {
      if (quoteState.get().isBusy || !text.trim()) return;
      const quote: MessageQuote = { id: uuidv7(), sourceMessageId: messageId, text };
      update({
        fields: {
          quotes: [...(quoteState.get().fields.quotes ?? []), quote],
          quoteAuthor: { role: 'assistant', ...(authorName ? { name: authorName } : {}) },
        },
        isBusy: false,
      });
      // The native selection menu dismisses after this callback; focus once it has gone.
      scheduleFocusFrame(() => {
        if (mounted.current && !quoteState.get().isBusy) {
          inputRef.current?.focus();
          inputRef.current?.insertLink(createQuoteMentionLabel(text), `quote://${quote.id}`);
          inputRef.current?.insertText(' ');
        }
      });
    },
    [authorName, inputRef, quoteState, scheduleFocusFrame, update],
  );
  const capture = useCallback(
    (draft: string): QuoteAttempt => {
      if (quoteState.get().isBusy) throw new Error('Quote admission is already pending.');
      const previousFields = quoteState.get().fields;
      const { quotes } = readQuoteMentions(draft, previousFields.quotes);
      const fields: QuoteFields = quotes.length
        ? { quotes, quoteAuthor: previousFields.quoteAuthor }
        : {};
      setPreview(undefined);
      update({ ...quoteState.get(), isBusy: true });
      let finished = false;
      return {
        fields,
        finish(accepted) {
          if (finished) return;
          finished = true;
          update({ fields: accepted ? {} : previousFields, isBusy: false });
        },
      };
    },
    [quoteState, update],
  );
  const previewQuote = useCallback<ChatQuoteActions['previewQuote']>(
    ({ url, ...anchor }) => {
      if (!mounted.current || quoteState.get().isBusy || !url.startsWith('quote://')) return;
      const quote = quoteState
        .get()
        .fields.quotes?.find((item) => item.id === url.slice('quote://'.length));
      if (quote)
        setPreview({
          anchor,
          text: quote.text,
          caption: quoteState.get().fields.quoteAuthor?.name ?? t('chat.quote.assistant'),
        });
    },
    [quoteState, t],
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
