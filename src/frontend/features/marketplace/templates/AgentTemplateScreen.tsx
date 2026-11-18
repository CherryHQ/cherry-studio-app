import { Button, ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { AgentTemplateDetails } from './AgentTemplateDetails';

/** Direct links retain their route; marketplace browsing previews the same content inline. */
export function AgentTemplateScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    templateId?: string | string[];
    templateLanguage?: string | string[];
  }>();
  const language =
    getSingleRouteParam(params.templateLanguage) ?? i18n.resolvedLanguage ?? i18n.language;
  const { catalog, isLoading, isFetching, error, refetch } = useAgentTemplateCatalog(language);
  const template = catalog?.templates.find(
    (item) => item.id === getSingleRouteParam(params.templateId),
  );

  return (
    <>
      <RouteHeader title={t('marketplace.templates.details')} />
      {template ? (
        <View className="flex-1 bg-background">
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pt-6 pb-8"
            contentInsetAdjustmentBehavior="never"
          >
            <AgentTemplateDetails template={template} />
          </ScrollView>
          <View
            className="border-t border-border-subtle px-5 pt-4"
            style={{ paddingBottom: Math.max(bottom, 16) }}
          >
            <Button
              onPress={() => {
                if (navigation.isFocused())
                  router.push({
                    pathname: '/agents/new',
                    params: {
                      templateId: template.id,
                      templateLanguage: language,
                      startChat: 'true',
                    },
                  });
              }}
              size="footer"
              testID="template-create"
            >
              {t('marketplace.templates.create')}
            </Button>
          </View>
        </View>
      ) : (
        <View className="p-5">
          {isLoading || isFetching ? (
            <ContentState.Loading title={t('marketplace.templates.loading')} />
          ) : (
            <ContentState.Error
              title={t(
                error ? 'marketplace.templates.loadFailed' : 'marketplace.templates.unavailable',
              )}
              primaryAction={
                error ? { children: t('common.retry'), onPress: () => void refetch() } : undefined
              }
            />
          )}
        </View>
      )}
    </>
  );
}
