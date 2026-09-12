import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Compatibility route for links created before provider editing moved into the
 * configuration tab on the detail screen.
 */
export default function ProviderEditScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();

  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <Redirect
      href={{
        params: { providerId },
        pathname: '/settings/provider/[providerId]',
      }}
    />
  );
}
