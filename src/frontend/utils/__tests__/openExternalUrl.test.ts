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

  it.each(['https://example.com', 'http://example.com', 'HTTPS://example.com'])(
    'opens web URL %s with Expo WebBrowser first',
    async (url) => {
      openBrowserAsyncMock.mockResolvedValue({ type: 'opened' });

      await openExternalUrl(` ${url} `);

      expect(openBrowserAsyncMock).toHaveBeenCalledWith(url);
      expect(openURLMock).not.toHaveBeenCalled();
    },
  );

  it('falls back to Linking when Expo WebBrowser fails', async () => {
    openBrowserAsyncMock.mockRejectedValue(new Error('unavailable'));
    openURLMock.mockResolvedValue(true);

    await openExternalUrl('https://example.com');

    expect(openBrowserAsyncMock).toHaveBeenCalledWith('https://example.com');
    expect(openURLMock).toHaveBeenCalledWith('https://example.com');
  });

  it.each(['mailto:user@example.com', 'tel:+123456789', 'sms:+123456789', 'geo:0,0'])(
    'opens supported external scheme %s without a browser',
    async (url) => {
      openURLMock.mockResolvedValue(true);

      await openExternalUrl(url);

      expect(openBrowserAsyncMock).not.toHaveBeenCalled();
      expect(openURLMock).toHaveBeenCalledWith(url);
    },
  );

  it('ignores an unavailable external application', async () => {
    openURLMock.mockRejectedValue(new Error('No application available'));

    await expect(openExternalUrl('mailto:user@example.com')).resolves.toBeUndefined();

    expect(openBrowserAsyncMock).not.toHaveBeenCalled();
  });

  it.each([
    '   ',
    'not a URL',
    '/local/document.pdf',
    'https://',
    'file:///storage/emulated/0/document.pdf',
    ' FILE:///storage/emulated/0/document.pdf ',
    'content://documents/document/123',
    'data:text/html,hello',
    'javascript:alert(1)',
    'blob:https://example.com/document',
    'intent://document#Intent;scheme=file;end',
    'custom-app://document',
  ])('does not send unsupported URL %s to native openers', async (url) => {
    await openExternalUrl(url);

    expect(openBrowserAsyncMock).not.toHaveBeenCalled();
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('ignores a web URL when both openers fail', async () => {
    openBrowserAsyncMock.mockRejectedValue(new Error('Browser unavailable'));
    openURLMock.mockRejectedValue(new Error('No application available'));

    await expect(openExternalUrl('https://example.com')).resolves.toBeUndefined();
  });
});
