import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import {
  Button,
  CodeBlock,
  formatMessagePartValue,
  hasMessagePartValue,
  MessagePart,
  type MessagePartSectionProps,
  useToast,
} from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { usePreference } from '@/frontend/data/hooks';

type MessageDetailSectionProps = Omit<MessagePartSectionProps, 'action'> & {
  copyText?: () => string;
  copyTestID?: string;
};

/** Application-owned clipboard and labels; CherryUI owns the section's presentation. */
export function MessageDetailSection({
  copyText,
  copyTestID,
  ...props
}: MessageDetailSectionProps) {
  const { t } = useTranslation();
  const copy = useCopyDetailText();

  return (
    <MessagePart.Section
      {...props}
      action={
        copyText ? (
          <Button
            accessibilityHint={props.title}
            accessibilityLabel={t('chat.tool.copyFullText')}
            icon={<CopyIcon className="text-muted-foreground" />}
            onPress={() => void copy(copyText)}
            size="sm"
            testID={copyTestID}
            variant="ghost"
          />
        ) : undefined
      }
    />
  );
}

type MessageDetailTextProps = Pick<MessagePartSectionProps, 'title' | 'tone'> & {
  copyTestID?: string;
  language?: string;
  /** Persisted and remote parts can omit error text despite their declared type. */
  value: string | undefined;
  variant?: 'body' | 'code';
};

export function MessageDetailText({
  language,
  value,
  variant = 'body',
  ...props
}: MessageDetailTextProps) {
  if (!value) return null;

  if (variant === 'code') {
    return <MessageDetailCode {...props} language={language} value={value} />;
  }

  return (
    <MessageDetailSection {...props} copyText={() => value}>
      <MessagePart.SectionBody>
        <Text className="text-base text-foreground" selectable>
          {value}
        </Text>
      </MessagePart.SectionBody>
    </MessageDetailSection>
  );
}

function MessageDetailCode({
  value,
  ...props
}: Omit<MessageDetailTextProps, 'value' | 'variant'> & { value: string }) {
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const { t } = useTranslation();
  const copy = useCopyDetailText();

  return (
    <CodeBlock
      {...props}
      code={value}
      copyLabel={t('chat.tool.copyFullText')}
      fontSizeStep={normalizeFontSizeStep(fontSizeStep)}
      onCopy={copy}
    />
  );
}

function useCopyDetailText() {
  const { t } = useTranslation();
  const { toast } = useToast();

  return async (text: string | (() => string)) => {
    try {
      await Clipboard.setStringAsync(typeof text === 'function' ? text() : text);
      toast.show({ label: t('chat.tool.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('chat.tool.copyFailed'), variant: 'danger' });
    }
  };
}

/** Invocation arguments read as one formatted document; metadata keeps ValueSection's fact rows. */
export function MessageDetailValue({
  value,
  ...props
}: Pick<MessageDetailTextProps, 'title'> & { value: unknown }) {
  if (!hasMessagePartValue(value)) return null;
  return (
    <MessageDetailText
      {...props}
      language="json"
      value={formatMessagePartValue(value, Number.POSITIVE_INFINITY)}
      variant={typeof value === 'string' ? 'body' : 'code'}
    />
  );
}
