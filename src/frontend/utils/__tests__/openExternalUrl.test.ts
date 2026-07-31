import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { openExternalUrl } from '../openExternalUrl';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock('react-native', () => {
  return {
    Linking: {
      openURL: jest.fn(),
    },
    Platform: {
      OS: 'ios',
      select: jest.fn((options) => options.ios ?? options.default),
    },
  };
});

const openBrowserAsyncMock = WebBrowser.openBrowserAsync as jest.Mock;
const openURLMock = Linking.openURL as jest.Mock;

describe('openExternalUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens URLs with Expo WebBrowser first', async () => {
    openBrowserAsyncMock.mockResolvedValue({ type: 'opened' });

    await openExternalUrl(' https://example.com ');

    expect(openBrowserAsyncMock).toHaveBeenCalledWith('https://example.com');
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('falls back to Linking when Expo WebBrowser fails', async () => {
    openBrowserAsyncMock.mockRejectedValue(new Error('unavailable'));
    openURLMock.mockResolvedValue(true);

    await openExternalUrl('https://example.com');

    expect(openBrowserAsyncMock).toHaveBeenCalledWith('https://example.com');
    expect(openURLMock).toHaveBeenCalledWith('https://example.com');
  });

  it('ignores empty URLs', async () => {
    await openExternalUrl('   ');

    expect(openBrowserAsyncMock).not.toHaveBeenCalled();
    expect(openURLMock).not.toHaveBeenCalled();
  });
});
