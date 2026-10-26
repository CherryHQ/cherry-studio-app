import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export async function openExternalUrl(url: string): Promise<void> {
  const targetUrl = url.trim();

  if (!targetUrl) {
    return;
  }

  let protocol: string;
  try {
    protocol = new URL(targetUrl).protocol;
  } catch {
    return;
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    // File and document URIs need the file viewer's permissions and sharing flow.
    // Passing them to a browser Activity can crash Android outside this JS catch.
    if (['mailto:', 'tel:', 'sms:', 'geo:'].includes(protocol)) {
      await Linking.openURL(targetUrl).catch(() => undefined);
    }
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(targetUrl);
  } catch {
    await Linking.openURL(targetUrl).catch(() => undefined);
  }
}
