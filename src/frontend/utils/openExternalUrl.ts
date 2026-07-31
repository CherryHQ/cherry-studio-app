import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export async function openExternalUrl(url: string): Promise<void> {
  const targetUrl = url.trim();

  if (!targetUrl) {
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(targetUrl);
  } catch {
    await Linking.openURL(targetUrl).catch(() => undefined);
  }
}
