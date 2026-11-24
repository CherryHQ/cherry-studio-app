import { Redirect } from 'expo-router';

/** Resume through the current flow when opening a previously shipped route. */
export default function LegacySubscriptionOnboardingRoute() {
  return <Redirect href="/onboarding" />;
}
