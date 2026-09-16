import { BottomSheet, Button, Image } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { createPaintingTemplatePrompt, type PaintingTemplate } from './paintingTemplates';

type PaintingTemplateBottomSheetProps = {
  onDismiss: () => void;
  onUse: (template: PaintingTemplate) => void;
  template: PaintingTemplate;
};

export function PaintingTemplateBottomSheet({
  onDismiss,
  onUse,
  template,
}: PaintingTemplateBottomSheetProps) {
  const { t } = useTranslation();
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  return (
    <BottomSheet
      closeAction={{ accessibilityLabel: t('painting.templates.close') }}
      footer={
        <Button
          accessibilityLabel={t('painting.templates.try')}
          onPress={() => onUse(template)}
          shape="pill"
          size="lg"
          testID="painting-template-try"
        >
          {t('painting.templates.try')}
        </Button>
      }
      onClose={onDismiss}
      open
      size="large"
      testID="painting-template"
      title={template.title}
    >
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-6 pt-2"
        testID="painting-template-sheet-body"
      >
        <View className="items-center">
          <Image
            accessibilityLabel={template.title}
            cachePolicy="memory-disk"
            className="aspect-[4/5] w-1/2 min-w-40 max-w-80 rounded-lg"
            contentFit="contain"
            source={template.preview}
            testID="painting-template-sheet-image"
          />
        </View>
        <View className="gap-2">
          <Text
            className="text-base text-foreground"
            numberOfLines={isPromptExpanded ? undefined : 4}
            selectable
            testID="painting-template-prompt"
          >
            {createPaintingTemplatePrompt(template)}
          </Text>
          <View className="items-start">
            <Button
              accessibilityState={{ expanded: isPromptExpanded }}
              onPress={() => setIsPromptExpanded((expanded) => !expanded)}
              size="sm"
              variant="ghost"
            >
              {t(
                isPromptExpanded
                  ? 'painting.templates.hidePrompt'
                  : 'painting.templates.showPrompt',
              )}
            </Button>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
