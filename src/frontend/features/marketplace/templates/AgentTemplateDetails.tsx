import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/Avatar';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { AgentTemplate } from '@/shared/data/types/agentTemplate';

import { AGENT_TEMPLATE_CATEGORY_KEYS } from './templateCategories';

/** The same readable content serves the inline preview and direct detail links. */
export function AgentTemplateDetails({ template }: { template: AgentTemplate }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const categories = template.categories.map((category) =>
    t(AGENT_TEMPLATE_CATEGORY_KEYS[category]),
  );

  async function copyInstructions() {
    try {
      await Clipboard.setStringAsync(template.prompt);
      toast.show({ label: t('marketplace.templates.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('marketplace.templates.copyFailed'), variant: 'danger' });
    }
  }

  return (
    <View className="gap-6" testID="template-details-content">
      <View className="flex-row items-start gap-4">
        <AgentAvatar emoji={template.emoji} name={template.name} size={64} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-semibold text-2xl text-foreground">{template.name}</Text>
          {categories.length || template.group.length ? (
            <Text className="text-sm text-muted-foreground">
              {(categories.length ? categories : template.group).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
      {template.description ? (
        <Text className="text-base text-muted-foreground">{template.description}</Text>
      ) : null}
      {template.prompt ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-semibold text-lg text-foreground">
              {t('agent.form.instructions')}
            </Text>
            <Button
              icon={<CopyIcon className="size-4 text-muted-foreground" />}
              onPress={() => void copyInstructions()}
              size="sm"
              testID="template-copy"
              variant="ghost"
            >
              {t('common.copy')}
            </Button>
          </View>
          <MarkdownText markdown={template.prompt} />
        </View>
      ) : null}
    </View>
  );
}
