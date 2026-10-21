import { Redirect } from 'expo-router';

/** The browser session redeems the callback; a deep link that reaches routing just goes home. */
export function AccountCallbackScreen() {
  return <Redirect href="/home" />;
}
