import { Button, useToast } from '@cherrystudio/ui/components';
import { isCancelledError, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { useBackendModule } from '@/frontend/data';
import { isSkillsError } from '@/shared/contracts/skills';
import { resolveAppLanguage, type AppLanguage } from '@/shared/utils/languages';

import { skillTranslationQueryOptions } from './skillTranslation';

type SkillDocumentProps = {
  contentHash: string;
  description: string;
  instructions: string;
};

export function SkillDocument(props: SkillDocumentProps) {
  const { i18n } = useTranslation();
  const language = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (
    <DocumentContent key={`${props.contentHash}:${language}`} {...props} language={language} />
  );
}

function DocumentContent({
  contentHash,
  description,
  instructions,
  language,
}: SkillDocumentProps & { language: AppLanguage }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const skills = useBackendModule('skills');
  const markdown = `${description}\n\n${instructions}`;
  const translation = useQuery({
    ...skillTranslationQueryOptions(skills, { contentHash, language, text: markdown }),
    enabled: false,
  });
  const [showTranslation, setShowTranslation] = useState(() => Boolean(translation.data));

  async function toggleTranslation() {
    if (translation.data) {
      setShowTranslation((value) => !value);
      return;
    }
    const result = await translation.refetch();
    if (result.data) {
      setShowTranslation(true);
    } else if (result.error && !isCancelledError(result.error)) {
      toast.show({
        label: t(
          isSkillsError(result.error) && result.error.code === 'translation-model-unavailable'
            ? 'skills.error.translation-model-unavailable'
            : 'skills.error.translation-failed',
        ),
        variant: 'danger',
      });
    }
  }

  return (
    <View className="gap-4">
      <View className="flex-row justify-end">
        <Button
          disabled={translation.isFetching}
          onPress={() => void toggleTranslation()}
          size="sm"
          variant="ghost"
        >
          {t(
            translation.isFetching
              ? 'skills.translation.translating'
              : showTranslation
                ? 'skills.translation.original'
                : 'skills.translation.translate',
          )}
        </Button>
      </View>
      <MarkdownText markdown={showTranslation && translation.data ? translation.data : markdown} />
    </View>
  );
}
