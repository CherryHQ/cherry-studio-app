import CircleXIcon from '@cherrystudio/app-icons/icons/circle-x';
import {
  BackgroundPressExclusion,
  Button,
  Composer,
  ContextMenuExclusion,
  useToast,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import type { QuoteFields } from '@/shared/contracts/agent';
import { stripMarkdownFormatting } from '@/shared/utils/markdownFormatting';

import { useChatQuoteActions, useChatQuoteState } from './ChatQuoteContext';

/** The quote waiting in the composer, in the attachment row's place above the field. */
export function DraftMessageQuotePreview() {
  const { fields, isBusy } = useChatQuoteState();
  const actions = useChatQuoteActions();
  const { t } = useTranslation();
  const line = useQuoteLine(fields);
  return (
    <Composer.Collapsible style={draftRowStyle}>
      {line ? (
        <BackgroundPressExclusion>
          <ContextMenuExclusion className="flex-row items-center rounded-lg bg-secondary">
            <Pressable
              {...line.pressProps}
              className="min-w-0 flex-1 py-1.5 pl-3 active:opacity-70"
            >
              <Text className="text-muted-foreground text-sm" numberOfLines={1}>
                {line.text}
              </Text>
            </Pressable>
            <Button
              accessibilityLabel={t('chat.quote.remove')}
              disabled={isBusy}
              icon={<CircleXIcon className="text-muted-foreground" />}
              onPress={actions?.clearQuote}
              shape="pill"
              size="xs"
              variant="ghost"
            />
          </ContextMenuExclusion>
        </BackgroundPressExclusion>
      ) : null}
    </Composer.Collapsible>
  );
}

/** The quote a sent or queued message carries; pressing it scrolls the transcript to the source. */
export function MessageQuotePreview({
  fields,
  numberOfLines = 2,
}: {
  fields: QuoteFields;
  numberOfLines?: number;
}) {
  const line = useQuoteLine(fields);
  if (!line) return null;
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="min-w-0 shrink">
        <Pressable
          {...line.pressProps}
          className="min-w-0 rounded-lg bg-secondary px-2.5 py-1.5 active:opacity-70"
        >
          <Text className="text-muted-foreground text-xs" numberOfLines={numberOfLines}>
            {line.text}
          </Text>
        </Pressable>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}

/** "Author: excerpt" in plain text, and the press that opens the source. */
function useQuoteLine(fields: QuoteFields) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useChatQuoteActions();
  const [isOpening, setIsOpening] = useState(false);
  const quote = fields.quotes?.[0];
  if (!quote || !fields.quoteAuthor) return undefined;
  const author = fields.quoteAuthor.name ?? t('chat.quote.assistant');
  const text = t('chat.quote.line', {
    author,
    text: stripMarkdownFormatting(quote.text).replace(/\s+/g, ' ').trim(),
  });
  const open = actions
    ? async () => {
        setIsOpening(true);
        const result = await actions.openQuote({
          sourceMessageId: quote.sourceMessageId,
          requestId: uuidv7(),
        });
        setIsOpening(false);
        if (result.state === 'unavailable') toast.show({ label: t('chat.quote.unavailable') });
        else if (result.state === 'retryable')
          toast.show({ label: t('chat.quote.retryable'), variant: 'danger' });
      }
    : undefined;
  return {
    text,
    pressProps: {
      accessibilityHint: open ? t('chat.quote.open') : undefined,
      accessibilityLabel: text,
      accessibilityRole: open ? ('button' as const) : ('text' as const),
      accessibilityState: { busy: isOpening },
      disabled: !open || isOpening,
      onPress: () => void open?.(),
    },
  };
}

// Matches the attachment row: flush with the field's text, the composer's rhythm below it.
const draftRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
