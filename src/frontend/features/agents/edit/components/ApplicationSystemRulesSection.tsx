import { BottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text } from 'react-native';

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
      <Section footer={t('agent.systemRules.description')}>
        <Section.SelectItem
          label={t('agent.systemRules.title')}
          onPress={() => {
            Keyboard.dismiss();
            setIsOpen(true);
          }}
          testID="agent-system-rules"
          value={modeLabel}
        />
      </Section>
      <BottomSheet
        closeAction={{ accessibilityLabel: t('common.close') }}
        onClose={() => setIsOpen(false)}
        open={isOpen}
        size="large"
        title={t('agent.systemRules.title')}
      >
        {isOpen ? (
          <ScrollView contentContainerClassName="gap-4 px-5 pb-8 pt-2">
            <Text className="text-sm text-muted-foreground">
              {t('agent.systemRules.description')}
            </Text>
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
