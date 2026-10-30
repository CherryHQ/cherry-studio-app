import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import { Spinner, useToast } from '@cherrystudio/ui/components';
import { isCancelledError, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteHeaderProps } from '@/frontend/appShell/header';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import { useBackendModule } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { useTranslationLanguageMenu } from '@/frontend/hooks/useTranslationLanguageMenu';
import { TranslationError } from '@/shared/contracts/translation';
import type { AppLanguage } from '@/shared/utils/languages';

import { SkillPage } from './SkillPage';
import {
  getCachedSkillTranslationLanguage,
  skillTranslationQueryOptions,
} from './skillTranslation';

type SkillDocumentPageProps = {
  children?: ReactNode;
  contentHash: string;
  description: string;
  footer?: ReactNode;
  headerProps: RouteHeaderProps;
  instructions: string;
};

export function SkillDocumentPage(props: SkillDocumentPageProps) {
  return <DocumentContent key={props.contentHash} {...props} />;
}

function DocumentContent({
  children,
  contentHash,
  description,
  footer,
  headerProps,
  instructions,
}: SkillDocumentPageProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const translator = useBackendModule('translation');
  const [language, setLanguage] = useState<AppLanguage | undefined>(() =>
    getCachedSkillTranslationLanguage(contentHash),
  );
  const markdown = `${description}\n\n${instructions}`;
  const translation = useQuery({
    ...(language
      ? skillTranslationQueryOptions(translator, { contentHash, language, text: markdown })
      : { queryKey: ['skillTranslation', contentHash, null], queryFn: skipToken }),
    enabled: false,
  });
  const [showTranslation, setShowTranslation] = useState(false);

  async function translate(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage);
    try {
      await queryClient.fetchQuery(
        skillTranslationQueryOptions(translator, {
          contentHash,
          language: nextLanguage,
          text: markdown,
        }),
      );
      setShowTranslation(true);
    } catch (error) {
      if (isCancelledError(error)) return;
      toast.show({
        label: t(
          error instanceof TranslationError && error.code === 'model-unavailable'
            ? 'translation.error.modelUnavailable'
            : 'translation.error.failed',
        ),
        variant: 'danger',
      });
    }
  }
  const languageItems = useTranslationLanguageMenu({
    onSelect: (nextLanguage) => void translate(nextLanguage),
    selectedLanguage: language ?? null,
  });

  return (
    <SkillPage
      footer={footer}
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
            // The progress glyph animates, so translating keeps the custom view.
            nativeIcon: translation.isFetching
              ? undefined
              : showTranslation
                ? 'doc.text'
                : 'translate',
            testID: 'skill-translation',
            ...(translation.data
              ? { onPress: () => setShowTranslation((shown) => !shown), type: 'icon' as const }
              : { items: languageItems, type: 'menu' as const }),
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
