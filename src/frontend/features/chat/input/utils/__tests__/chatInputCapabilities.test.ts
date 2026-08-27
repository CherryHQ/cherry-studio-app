import { getChatInputTemporaryCapabilities } from '../chatInputCapabilities';

describe('getChatInputTemporaryCapabilities', () => {
  test('derives turn-only capabilities from the active input controls', () => {
    expect(
      getChatInputTemporaryCapabilities({
        isWebSearchEnabled: true,
        text: '[Create image](tool://create-image) Draw a lighthouse.',
      }),
    ).toEqual(['web-search', 'image-generation']);
  });

  test('does not treat ordinary text as a capability request', () => {
    expect(
      getChatInputTemporaryCapabilities({
        isWebSearchEnabled: false,
        text: 'Search the web and create an image.',
      }),
    ).toEqual([]);
  });
});
