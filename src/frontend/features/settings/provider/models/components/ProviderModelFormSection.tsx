import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Section } from '@cherrystudio/ui/components';
import { useState, type ReactNode } from 'react';
import { Keyboard, Text } from 'react-native';

/** Collapsed model settings retain their draft in the owning form. */
export function ProviderModelFormSection({
  title,
  summary,
  errorMessage,
  disabled,
  children,
}: {
  title: string;
  summary: string;
  errorMessage?: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <Section>
      <Section.Item
        label={title}
        accessibilityLabel={`${title}, ${errorMessage ?? summary}`}
        description={
          <Text
            className={errorMessage ? 'text-error text-sm' : 'text-muted-foreground text-sm'}
            numberOfLines={errorMessage ? undefined : 2}
          >
            {errorMessage ?? summary}
          </Text>
        }
        accessibilityState={{ expanded: isExpanded }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setIsExpanded((current) => !current);
        }}
        trailing={
          isExpanded ? (
            <ChevronUpIcon className="size-5 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-5 text-muted-foreground" />
          )
        }
      />
      {isExpanded ? children : null}
    </Section>
  );
}
