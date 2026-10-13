import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import { Spinner, useToast } from '@cherrystudio/ui/components';
import { isCancelledError, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteHeaderProps } from '@/frontend/appShell/header';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import { useBackendModule } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { TranslationError } from '@/shared/contracts/translation';
import { resolveAppLanguage, type AppLanguage } from '@/shared/utils/languages';

import { SkillPage } from './SkillPage';
import { skillTranslationQueryOptions } from './skillTranslation';

type SkillDocumentPageProps = {
  children?: ReactNode;
  contentHash: string;
  description: string;
  headerProps: RouteHeaderProps;
  instructions: string;
};

export function SkillDocumentPage(props: SkillDocumentPageProps) {
  const { i18n } = useTranslation();
  const language = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (
    <DocumentContent key={`${props.contentHash}:${language}`} {...props} language={language} />
  );
}

function DocumentContent({
  children,
  contentHash,
  description,
  headerProps,
  instructions,
  language,
}: SkillDocumentPageProps & { language: AppLanguage }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const translator = useBackendModule('translation');
  const markdown = `${description}\n\n${instructions}`;
  const translation = useQuery({
    ...skillTranslationQueryOptions(translator, { contentHash, language, text: markdown }),
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
          result.error instanceof TranslationError && result.error.code === 'model-unavailable'
            ? 'translation.error.modelUnavailable'
            : 'translation.error.failed',
        ),
        variant: 'danger',
      });
    }
  }

  return (
    <SkillPage
      headerProps={{
        ...headerProps,
        rightActions: [
          {
            accessibilityLabel: t(
              translation.isFetching
                ? 'skills.translation.translating'
                : showTranslation
                  ? 'skills.translation.original'
                  : 'skills.translation.translate',
            ),
            disabled: translation.isFetching,
            icon: translation.isFetching
              ? TranslationProgressIcon
              : showTranslation
                ? FileTextIcon
                : LanguagesIcon,
            key: 'skill-translation',
            onPress: () => void toggleTranslation(),
            testID: 'skill-translation',
            type: 'icon',
          },
          ...(headerProps.rightActions ?? []),
        ],
      }}
    >
      {children}
      <MarkdownText markdown={showTranslation && translation.data ? translation.data : markdown} />
    </SkillPage>
  );
}

function TranslationProgressIcon() {
  const color = useThemeColor('foreground');
  return <Spinner color={color} size="sm" />;
}
