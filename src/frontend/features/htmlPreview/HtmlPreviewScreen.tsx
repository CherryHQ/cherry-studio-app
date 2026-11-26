import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ContentState, type MenuItem, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { HtmlBody } from '@/frontend/components/HtmlBody';
import { readHtmlPreviewHandoff } from '@/frontend/components/HtmlPreview';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/** Full-screen live view of one HTML document opened from Markdown or the file viewer. */
export function HtmlPreviewScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ handoff?: string | string[] }>();
  const source = readHtmlPreviewHandoff(getSingleRouteParam(params.handoff));

  const copy = async () => {
    if (!source) return;
    try {
      await Clipboard.setStringAsync(source);
      toast.show({ label: t('htmlPreview.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('htmlPreview.copyFailed'), variant: 'danger' });
    }
  };
  const openInBrowser = () => {
    if (!source) return;
    void openExternalUrl(`data:text/html;charset=utf-8,${encodeURIComponent(source)}`);
  };

  const menuItems: MenuItem[] = source
    ? [
        { id: 'copy', label: t('htmlPreview.copySource'), onPress: () => void copy() },
        {
          id: 'open-browser',
          label: t('htmlPreview.openInBrowser'),
          onPress: openInBrowser,
        },
      ]
    : [];

  return (
    <>
      <RouteHeader
        title={t('htmlPreview.title')}
        rightActions={
          menuItems.length
            ? [
                {
                  accessibilityLabel: t('common.more'),
                  icon: EllipsisIcon,
                  items: menuItems,
                  key: 'more',
                  nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
                  type: 'menu',
                },
              ]
            : undefined
        }
      />
      {source ? (
        <HtmlBody html={source} onFailure={() => undefined} />
      ) : (
        <View className="flex-1 justify-center p-4">
          <ContentState.Error title={t('htmlPreview.unavailable')} />
        </View>
      )}
    </>
  );
}
