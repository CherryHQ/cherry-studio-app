import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type AgentInstructionsSectionProps = {
  onBlur: () => void;
  onChangeText: (value: string) => void;
  value: string;
};

/** The form previews text; Edit opens the complete instructions in an independent sheet. */
export function AgentInstructionsSection({
  onBlur,
  onChangeText,
  value,
}: AgentInstructionsSectionProps) {
  const { t } = useTranslation();
  const [isPresented, setIsPresented] = useState(false);
  const open = () => {
    Keyboard.dismiss();
    setIsPresented(true);
  };

  return (
    <>
      <Section>
        <Section.Header title={t('agent.form.instructions')}>
          <Button
            hitSlop={8}
            onPress={open}
            size="inline"
            testID="agent-instructions-edit"
            variant="ghost"
          >
            <Text className="font-medium text-primary text-sm">{t('common.edit')}</Text>
          </Button>
        </Section.Header>
        <View className="px-4 pt-3 pb-2" testID="agent-instructions-preview">
          <Text
            className={cn('text-base', value ? 'text-foreground' : 'text-muted-foreground')}
            numberOfLines={5}
            selectable={false}
          >
            {value || t('agent.form.instructionsPlaceholder')}
          </Text>
        </View>
      </Section>
      {isPresented ? (
        <AgentInstructionsSheet
          onBlur={onBlur}
          onChangeText={onChangeText}
          onClosed={() => setIsPresented(false)}
          value={value}
        />
      ) : null}
    </>
  );
}

function AgentInstructionsSheet({
  onBlur,
  onChangeText,
  onClosed,
  value,
}: AgentInstructionsSectionProps & {
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const mutedForegroundColor = useThemeColor('muted-foreground');
  const close = () => {
    Keyboard.dismiss();
    onBlur();
    setOpen(false);
  };

  return (
    <BottomSheet
      avoidKeyboard
      dismissible={false}
      headerAction={
        <Button
          hitSlop={6}
          onPress={close}
          size="inline"
          testID="agent-instructions-done"
          variant="ghost"
        >
          <Text className="font-medium text-base text-primary">{t('common.done')}</Text>
        </Button>
      }
      onBack={close}
      onClose={close}
      onClosed={onClosed}
      open={open}
      presentation="default"
      size="full"
      testID="agent-instructions-sheet"
      title={t('agent.form.instructions')}
    >
      <View className="min-h-0 flex-1 pb-6">
        <TextInput
          accessibilityLabel={t('agent.form.instructions')}
          autoCorrect
          autoFocus
          className="min-h-0 flex-1 px-6 pt-4 pb-6 text-base text-foreground"
          cursorColor={mutedForegroundColor}
          multiline
          onBlur={onBlur}
          onChangeText={onChangeText}
          placeholder={t('agent.form.instructionsPlaceholder')}
          placeholderTextColor={mutedForegroundColor}
          scrollEnabled
          selectionColor={mutedForegroundColor}
          testID="agent-instructions-input"
          textAlignVertical="top"
          value={value}
        />
      </View>
    </BottomSheet>
  );
}
