import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { AGENT_TEMPLATE_CATEGORY_KEYS } from './templateCategories';

export function AgentTemplateScreen() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
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

  async function copyInstructions() {
    if (!template) return;
    try {
      await Clipboard.setStringAsync(template.prompt);
      toast.show({ label: t('marketplace.templates.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('marketplace.templates.copyFailed'), variant: 'danger' });
    }
  }

  return (
    <>
      <RouteHeader title={t('marketplace.templates.details')} />
      {template ? (
        <View className="flex-1 bg-background">
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-6 p-4"
            contentInsetAdjustmentBehavior="never"
          >
            <View className="items-center gap-3 py-4">
              <AgentAvatar emoji={template.emoji} name={template.name} size={80} />
              <Text className="text-center font-semibold text-2xl text-foreground">
                {template.name}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">
                {template.categories
                  .map((category) => t(AGENT_TEMPLATE_CATEGORY_KEYS[category]))
                  .join(' · ')}
              </Text>
              <Text className="text-center text-base text-muted-foreground">
                {template.description}
              </Text>
            </View>
            <View className="gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="font-semibold text-lg text-foreground">
                  {t('agent.form.instructions')}
                </Text>
                <Button onPress={() => void copyInstructions()} size="sm" variant="ghost">
                  {t('common.copy')}
                </Button>
              </View>
              <Text className="text-base text-foreground" selectable>
                {template.prompt}
              </Text>
            </View>
          </ScrollView>
          <View
            className="gap-3 border-t border-border-subtle px-4 pt-4"
            style={{ paddingBottom: Math.max(bottom, 16) }}
          >
            <Text className="text-center text-sm text-muted-foreground">
              {t('marketplace.templates.editable')}
            </Text>
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
        <View className="p-4">
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
