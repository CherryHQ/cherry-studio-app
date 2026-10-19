import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ComposerSessionProvider } from '@/frontend/components/Composer';
import { PaintingInputProvider } from '@/frontend/components/PaintingInput';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { usePaintingTemplates } from '../hooks/usePaintingTemplates';
import { takePaintingTemplateOrigin } from '../utils/paintingTemplateOrigin';
import { TemplateStage } from './components/TemplateStage';

/**
 * `/drawings/templates` presents the template stage over the gallery. A
 * `templateId` starts on that template; without one the stage starts at the
 * first. Using a template starts its board here and hands over to `/paintings`.
 */
export function PaintingTemplateStageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ templateId?: string | string[] }>();
  const [templateId] = useState(() => getSingleRouteParam(params.templateId));
  const [origin] = useState(() => takePaintingTemplateOrigin(templateId));
  const templates = usePaintingTemplates();
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/drawings');
  }, [router]);

  if (!templates.data) {
    return (
      <View className="flex-1 justify-center bg-background px-8">
        {templates.isPending ? (
          <Spinner
            accessibilityLabel={t('painting.templates.loading')}
            accessibilityRole="progressbar"
          />
        ) : (
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void templates.refetch() }}
            secondaryAction={{ children: t('common.back'), onPress: close }}
            title={t('painting.templates.loadFailed')}
          />
        )}
      </View>
    );
  }

  return (
    <ComposerSessionProvider>
      <PaintingInputProvider>
        <TemplateStage
          initialTemplateId={templateId}
          onClose={close}
          origin={origin}
          templates={templates.data}
        />
      </PaintingInputProvider>
    </ComposerSessionProvider>
  );
}
