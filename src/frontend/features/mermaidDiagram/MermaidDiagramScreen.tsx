import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  MermaidSvgView,
  readMermaidViewerHandoff,
  useMermaidRender,
} from '@/frontend/components/MermaidDiagram';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/** Full-screen, pinch-zoomable view of one Mermaid diagram opened from Markdown. */
export function MermaidDiagramScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ handoff?: string | string[] }>();
  const source = readMermaidViewerHandoff(getSingleRouteParam(params.handoff));

  return (
    <>
      <RouteHeader title={t('mermaid.diagram')} />
      {source ? (
        <MermaidDiagramBody source={source} />
      ) : (
        <View className="flex-1 justify-center p-4">
          <ContentState.Error title={t('mermaid.unavailable')} />
        </View>
      )}
    </>
  );
}

function MermaidDiagramBody({ source }: { source: string }) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const result = useMermaidRender(source, theme === 'dark');

  if (result?.status === 'rendered') return <MermaidSvgView diagram={result} variant="viewer" />;
  return (
    <View className="flex-1 justify-center p-4">
      {result ? (
        <ContentState.Error title={t('mermaid.unavailable')} />
      ) : (
        <ContentState.Loading title={t('mermaid.rendering')} />
      )}
    </View>
  );
}
