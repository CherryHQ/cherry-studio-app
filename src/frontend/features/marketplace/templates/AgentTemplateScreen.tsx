import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { AgentTemplate } from '@/shared/data/types/agentTemplate';

import { MarketplaceIcon } from '../components/MarketplaceIcon';
import { TEMPLATE_COLLECTION_TITLE_KEYS } from './templateCategories';

/** One template's page: who it is, its complete instructions, and a single create action. */
export function AgentTemplateScreen() {
  const { t, i18n } = useTranslation();
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

  if (template) return <AgentTemplatePage language={language} template={template} />;

  return (
    <>
      <RouteHeader title={t('marketplace.templates.details')} />
      <View className="flex-1 bg-background px-8 py-16">
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
    </>
  );
}

function AgentTemplatePage({ language, template }: { language: string; template: AgentTemplate }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const labels = template.categories.length
    ? template.categories.map((category) => t(TEMPLATE_COLLECTION_TITLE_KEYS[category]))
    : template.group;

  function createFromTemplate() {
    if (!navigation.isFocused()) return;
    router.push({
      pathname: '/agents/new',
      params: { templateId: template.id, templateLanguage: language, startChat: 'true' },
    });
  }

  async function copyInstructions() {
    try {
      await Clipboard.setStringAsync(template.prompt);
      toast.show({ label: t('marketplace.templates.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('marketplace.templates.copyFailed'), variant: 'danger' });
    }
  }

  return (
    <>
      <RouteHeader
        title={t('marketplace.templates.details')}
        rightActions={
          template.prompt
            ? [
                {
                  accessibilityLabel: t('marketplace.templates.copy'),
                  icon: CopyIcon,
                  key: 'template-copy',
                  nativeIcon: require('@/assets/header-toolbar/copy.png'),
                  onPress: () => void copyInstructions(),
                  testID: 'template-copy',
                  type: 'icon',
                },
              ]
            : undefined
        }
      />
      <View className="flex-1 bg-background">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-8 px-4 pt-6 pb-8"
          contentInsetAdjustmentBehavior="never"
          testID="template-details-content"
        >
          <View className="gap-4">
            <View className="flex-row items-center gap-4">
              <MarketplaceIcon
                emoji={template.emoji}
                kind="template"
                name={template.name}
                size="large"
              />
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-semibold text-foreground"
                  selectable
                >
                  {template.name}
                </Text>
                {labels.length ? (
                  <Text className="text-sm text-muted-foreground">{labels.join(' · ')}</Text>
                ) : null}
              </View>
            </View>
            {template.description ? (
              <Text className="text-base text-muted-foreground" selectable>
                {template.description}
              </Text>
            ) : null}
          </View>
          {template.prompt ? (
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
                {t('agent.form.instructions')}
              </Text>
              <MarkdownText markdown={template.prompt} />
            </View>
          ) : null}
        </ScrollView>
        <View
          className="border-t border-border-subtle px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 16) }}
        >
          <Button onPress={createFromTemplate} size="footer" testID="template-create">
            {t('marketplace.templates.create')}
          </Button>
        </View>
      </View>
    </>
  );
}
