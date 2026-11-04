import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import Minimize2Icon from '@cherrystudio/app-icons/icons/minimize-2';
import { Button, Section } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type AgentInstructionsSectionProps = {
  expanded: boolean;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  presentation: 'page' | 'sheet';
  value: string;
};

/** Resize one native field in place so expansion keeps its buffer, selection and scroll. */
export function AgentInstructionsSection({
  expanded,
  onBlur,
  onChangeText,
  onExpandedChange,
  presentation,
  value,
}: AgentInstructionsSectionProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const isReading = presentation === 'sheet' && !expanded;
  const mutedForegroundColor = useThemeColor('muted-foreground');
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  return (
    <Section
      className={expanded ? 'flex-1' : undefined}
      contentClassName={expanded ? 'flex-1 rounded-none' : undefined}
    >
      <Section.Header title={t('agent.form.instructions')}>
        <Button
          accessibilityLabel={t(
            expanded ? 'chat.input.action.collapseEditor' : 'chat.input.action.expandEditor',
          )}
          accessibilityState={{ expanded }}
          hitSlop={6}
          icon={
            expanded ? (
              <Minimize2Icon className="text-muted-foreground" />
            ) : (
              <Maximize2Icon className="text-muted-foreground" />
            )
          }
          onPress={() => {
            onExpandedChange(!expanded);
            if (expanded) onBlur();
          }}
          size="sm"
          testID="agent-instructions-expand"
          variant="ghost"
        />
      </Section.Header>
      {/* Android disables the native scroller with editable=false. Keep both views
          mounted so reading can scroll while the input retains its editing state. */}
      <ScrollView className={cn('max-h-96', !isReading && 'hidden')} nestedScrollEnabled>
        <Text
          className={cn(
            'min-h-28 px-4 py-3 text-base',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
          selectable={false}
        >
          {value || t('agent.form.instructionsPlaceholder')}
        </Text>
      </ScrollView>
      <TextInput
        accessibilityLabel={t('agent.form.instructions')}
        autoCorrect
        className={cn(
          'px-4 py-3 text-base text-foreground',
          expanded ? 'flex-1' : 'min-h-28 max-h-96',
          isReading && 'hidden',
        )}
        cursorColor={mutedForegroundColor}
        multiline
        onBlur={onBlur}
        onChangeText={onChangeText}
        placeholder={t('agent.form.instructionsPlaceholder')}
        placeholderTextColor={mutedForegroundColor}
        ref={inputRef}
        scrollEnabled
        selectionColor={mutedForegroundColor}
        textAlignVertical="top"
        value={value}
      />
    </Section>
  );
}
