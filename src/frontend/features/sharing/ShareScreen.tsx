import { Alert, BottomSheet, BottomSheetProvider, ContentState } from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  claimShareRequest,
  getShareRequest,
  scheduleShareFinish,
} from '@/frontend/appShell/sharing';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { DocumentShareSheet } from './components/DocumentShareSheet';
import { FileShareSheet } from './components/FileShareSheet';

export function ShareScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const id = getSingleRouteParam(params.requestId);
  return (
    // Native permission guidance must present from this modal route's controller.
    <Alert.Provider labels={{ cancel: t('common.cancel'), ok: t('common.ok') }}>
      <BottomSheetProvider>
        <ShareRoute key={id} requestId={id} />
      </BottomSheetProvider>
    </Alert.Provider>
  );
}

function ShareRoute({ requestId }: { requestId?: string }) {
  const { t } = useTranslation();
  const [request] = useState(() => getShareRequest(requestId));
  useEffect(() => {
    if (!request) return;
    claimShareRequest(request.id);
    return () => scheduleShareFinish(request.id);
  }, [request]);
  return (
    <View className="flex-1">
      {request?.kind === 'document' ? (
        <DocumentShareSheet request={request} onClose={closeShare} />
      ) : request?.kind === 'files' ? (
        <FileShareSheet request={request} onClose={closeShare} />
      ) : (
        <BottomSheet open onClose={closeShare} size="medium" title={t('common.share')}>
          <View className="flex-1 justify-center p-6">
            <ContentState.Error title={t('documentExport.unavailable')} />
          </View>
        </BottomSheet>
      )}
    </View>
  );
}

function closeShare() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
