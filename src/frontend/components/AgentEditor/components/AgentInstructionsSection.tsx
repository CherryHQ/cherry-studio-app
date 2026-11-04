import { Button, Section } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type AgentInstructionsSectionProps = {
  onBlur: () => void;
  onChangeText: (value: string) => void;
  value: string;
};

/** Reading and scrolling never focus an input; the explicit edit action enables it. */
export function AgentInstructionsSection({
  onBlur,
  onChangeText,
  value,
}: AgentInstructionsSectionProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const mutedForegroundColor = useThemeColor('muted-foreground');

  return (
    <Section>
      <Section.Header title={t('agent.form.instructions')}>
        <Button
          onPress={() => {
            if (isEditing) inputRef.current?.blur();
            else setIsEditing(true);
          }}
          size="sm"
          variant="ghost"
        >
          {isEditing ? t('common.done') : t('common.edit')}
        </Button>
      </Section.Header>
      {isEditing ? (
        <TextInput
          accessibilityLabel={t('agent.form.instructions')}
          autoCorrect
          autoFocus
          className="min-h-28 max-h-120 px-4 py-3 text-base text-foreground"
          cursorColor={mutedForegroundColor}
          multiline
          onBlur={() => {
            setIsEditing(false);
            onBlur();
          }}
          onChangeText={onChangeText}
          placeholder={t('agent.form.instructionsPlaceholder')}
          placeholderTextColor={mutedForegroundColor}
          ref={inputRef}
          scrollEnabled
          selectionColor={mutedForegroundColor}
          textAlignVertical="top"
          value={value}
        />
      ) : (
        <ScrollView className="max-h-120" nestedScrollEnabled>
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
      )}
    </Section>
  );
}
