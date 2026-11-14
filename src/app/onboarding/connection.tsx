import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingConnectionScreen } from '@/frontend/features/onboarding/provider';
import { useProviderApiServiceSheetClose } from '@/frontend/features/settings/provider/apiService';
import {
  ProviderConfiguration,
  useNewProviderConfiguration,
  useSavedProviderConfiguration,
} from '@/frontend/features/settings/provider/new';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/** Mount the original configuration UI and controllers inside the first-use frame. */
export default function OnboardingConnectionRoute() {
  const params = useLocalSearchParams<{
    providerId?: string | string[];
    connectionId?: string | string[];
  }>();
  const providerId = getSingleRouteParam(params.providerId);
  const connectionId = getSingleRouteParam(params.connectionId);
  return providerId ? (
    <SavedConnection connectionId={connectionId} key={providerId} providerId={providerId} />
  ) : (
    <NewConnection />
  );
}

function NewConnection() {
  const router = useRouter();
  const configuration = useNewProviderConfiguration();
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: configuration.isDirty,
    isSaving: configuration.isCreating,
    onClose: () => router.replace('/onboarding/provider'),
  });
  return (
    <OnboardingConnectionScreen
      {...configuration}
      isSaving={configuration.isCreating}
      onBack={requestClose}
      onContinue={() => {
        void configuration.create().then((created) => {
          if (created) {
            allowNavigation();
            router.replace({
              pathname: '/onboarding/model',
              params: { providerId: created.providerId },
            });
          }
        });
      }}
    >
      <ProviderConfiguration value={configuration.value} />
    </OnboardingConnectionScreen>
  );
}

function SavedConnection({
  connectionId,
  providerId,
}: {
  connectionId?: string;
  providerId: string;
}) {
  const router = useRouter();
  const configuration = useSavedProviderConfiguration(providerId);
  return (
    <OnboardingConnectionScreen
      {...configuration}
      onContinue={() =>
        router.replace({
          pathname: '/onboarding/model',
          params: connectionId ? { connectionId } : { providerId },
        })
      }
    >
      <ProviderConfiguration value={configuration.value} />
    </OnboardingConnectionScreen>
  );
}
