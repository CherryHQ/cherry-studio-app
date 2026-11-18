import {
  BackgroundPressExclusion,
  ContextMenuExclusion,
  useToast,
} from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import type { QuoteFields } from '@/shared/contracts/agent';
import { stripMarkdownFormatting } from '@/shared/utils/markdownFormatting';

import { useChatQuoteActions } from './ChatQuoteContext';

/** The quote a sent message carries; pressing it scrolls the transcript to the source. */
export function MessageQuotePreview({ fields }: { fields: QuoteFields }) {
  const occurrences = new Map<string, number>();
  return (
    <>
      {fields.quotes
        ?.filter((quote) => !quote.reference)
        .map((quote) => {
          const occurrence = occurrences.get(quote.id) ?? 0;
          occurrences.set(quote.id, occurrence + 1);
          return (
            <LegacyMessageQuotePreview
              key={`${quote.id}-${occurrence}`}
              fields={{ ...fields, quotes: [quote] }}
            />
          );
        })}
    </>
  );
}

function LegacyMessageQuotePreview({ fields }: { fields: QuoteFields }) {
  const line = useQuoteLine(fields);
  if (!line) return null;
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="min-w-0 shrink">
        <Pressable
          {...line.pressProps}
          className="min-w-0 rounded-lg bg-secondary px-2.5 py-1.5 active:opacity-70"
        >
          <Text className="text-muted-foreground text-xs" numberOfLines={2}>
            {line.text}
          </Text>
        </Pressable>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}

/** "Author: excerpt" in plain text, or nothing for a part without a quote. */
export function messageQuoteLine(fields: QuoteFields, t: TFunction): string | undefined {
  if (!fields.quotes?.length || !fields.quoteAuthor) return undefined;
  return t('chat.quote.line', {
    author: fields.quoteAuthor.name ?? t('chat.quote.assistant'),
    text: fields.quotes
      .map((quote) => stripMarkdownFormatting(quote.text).replace(/\s+/g, ' ').trim())
      .join('\n'),
  });
}

/** The quote's line and the press that opens the source. */
function useQuoteLine(fields: QuoteFields) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useChatQuoteActions();
  const [isOpening, setIsOpening] = useState(false);
  const quote = fields.quotes?.find((item) => !item.reference);
  const text = messageQuoteLine(fields, t);
  if (!quote || !text) return undefined;
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
