import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';

import { MessageDetailSection } from '@/frontend/components/MessageDetail';
import type { AgentMode } from '@/shared/data/types/agent';
import { buildApplicationSystemRules } from '@/shared/utils/applicationSystemRules';
import { resolveAppLanguage } from '@/shared/utils/languages';

export function ApplicationSystemRulesSection({ mode }: { mode: AgentMode }) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const modeLabel = t(
    mode === 'minimal' ? 'agent.mode.minimal.label' : 'agent.mode.standard.label',
  );
  const rules = isOpen
    ? buildApplicationSystemRules(mode, resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language))
    : '';

  return (
    <>
      <View className="flex-row flex-wrap items-center gap-x-1">
        <Text className="max-w-full text-sm text-muted-foreground">
          {t('agent.systemRules.description')}
        </Text>
        <Button
          onPress={() => {
            Keyboard.dismiss();
            setIsOpen(true);
          }}
          size="inline"
          testID="agent-system-rules"
          variant="link"
        >
          {t('agent.systemRules.view')}
        </Button>
      </View>
      <BottomSheet
        closeAction={{ accessibilityLabel: t('common.close') }}
        onClose={() => setIsOpen(false)}
        open={isOpen}
        size="large"
        title={t('agent.systemRules.title')}
      >
        {isOpen ? (
          <ScrollView contentContainerClassName="gap-4 px-5 pb-8 pt-2">
            <MessageDetailSection
              copyTestID="agent-system-rules-copy"
              copyText={() => rules}
              title={modeLabel}
            >
              <Text className="text-base text-foreground" selectable>
                {rules}
              </Text>
            </MessageDetailSection>
          </ScrollView>
        ) : null}
      </BottomSheet>
    </>
  );
}
