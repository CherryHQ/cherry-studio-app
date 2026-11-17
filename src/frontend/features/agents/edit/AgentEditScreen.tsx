import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { AgentEditor } from '@/frontend/components/AgentEditor';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { AgentTemplate } from '@/shared/data/types/agentTemplate';

export default function AgentEditScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    startChat?: string | string[];
    templateId?: string | string[];
    templateLanguage?: string | string[];
  }>();
  const agentId = getSingleRouteParam(params.agentId);
  const templateId = !agentId ? getSingleRouteParam(params.templateId) : undefined;
  const sourceLanguage = getSingleRouteParam(params.templateLanguage);
  const templateLanguage = sourceLanguage ?? i18n.resolvedLanguage ?? i18n.language;
  const templateIdentity = `${templateId ?? ''}:${sourceLanguage ?? 'app'}`;
  const [templateSeed, setTemplateSeed] = useState<{
    identity: string;
    content: AgentTemplate;
    language: string;
  } | null>(null);
  const seededTemplate = templateSeed?.identity === templateIdentity ? templateSeed : null;
  const templateCatalog = useAgentTemplateCatalog(
    templateLanguage,
    Boolean(templateId) && !seededTemplate,
  );
  const template = templateId
    ? (seededTemplate?.content ??
      templateCatalog.catalog?.templates.find((item) => item.id === templateId))
    : undefined;
  // The draft owns this content once selected, including through provider setup.
  if (template && !seededTemplate)
    setTemplateSeed({ identity: templateIdentity, content: template, language: templateLanguage });

  if (templateId && !template) {
    return (
      <>
        <RouteHeader title={t('agent.create.title')} />
        <View className="p-4">
          {templateCatalog.isLoading || templateCatalog.isFetching ? (
            <ContentState.Loading title={t('marketplace.templates.loading')} />
          ) : (
            <ContentState.Error
              title={t(
                templateCatalog.error
                  ? 'marketplace.templates.loadFailed'
                  : 'marketplace.templates.unavailable',
              )}
              primaryAction={
                templateCatalog.error
                  ? { children: t('common.retry'), onPress: () => void templateCatalog.refetch() }
                  : undefined
              }
            />
          )}
        </View>
      </>
    );
  }

  return (
    <AgentEditor
      agentId={agentId}
      shouldStartChat={
        !agentId && (Boolean(template) || getSingleRouteParam(params.startChat) === 'true')
      }
      template={seededTemplate ?? undefined}
    />
  );
}
