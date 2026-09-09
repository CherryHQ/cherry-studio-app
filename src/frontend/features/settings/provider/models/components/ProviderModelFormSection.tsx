import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Section } from '@cherrystudio/ui/components';
import { useState, type ReactNode } from 'react';
import { Keyboard, Text, View } from 'react-native';

/** Collapsed model settings retain their draft in the owning form. */
export function ProviderModelFormSection({
  title,
  summary,
  errorMessage,
  disabled,
  children,
}: {
  title: string;
  summary?: string;
  errorMessage?: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <Section variant="plain">
      <Section.Item
        label={title}
        accessibilityLabel={[title, errorMessage ?? summary].filter(Boolean).join(', ')}
        description={
          errorMessage ? <Text className="text-error text-sm">{errorMessage}</Text> : undefined
        }
        accessibilityState={{ expanded: isExpanded }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setIsExpanded((current) => !current);
        }}
        trailing={
          <View className="min-w-0 flex-row items-center gap-2">
            {!isExpanded && !errorMessage && summary ? (
              <Text
                className="min-w-0 shrink text-right text-sm text-muted-foreground"
                numberOfLines={1}
              >
                {summary}
              </Text>
            ) : null}
            {isExpanded ? (
              <ChevronUpIcon className="size-5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
            )}
          </View>
        }
      />
      {isExpanded ? children : null}
    </Section>
  );
}
