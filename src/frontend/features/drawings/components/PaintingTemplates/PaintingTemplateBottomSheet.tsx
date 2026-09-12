import { BottomSheet, Button, Image } from '@cherrystudio/ui/components';
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
            className="h-52 w-40 rounded-lg"
            contentFit="contain"
            source={template.preview}
            testID="painting-template-sheet-image"
          />
        </View>
        <Text className="text-base text-foreground" selectable testID="painting-template-prompt">
          {createPaintingTemplatePrompt(template)}
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}
