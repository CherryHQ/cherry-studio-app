import { act, create } from 'react-test-renderer';

import { MarkdownText } from '../MarkdownText';

const mockCherryMarkdownText = jest.fn((_props: Record<string, unknown>) => null);
const mockOpenExternalUrl = jest.fn();
let mockStoredFontSizeStep = 1;

jest.mock('@cherrystudio/ui/components', () => ({
  MarkdownText: (props: Record<string, unknown>) => mockCherryMarkdownText(props),
}));
jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockStoredFontSizeStep, jest.fn()],
}));
jest.mock('@/frontend/utils/openExternalUrl', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

describe('MarkdownText adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoredFontSizeStep = 1;
  });

  it('passes the stored preference and external-link action to CherryUI', () => {
    act(() => {
      create(<MarkdownText markdown="[Cherry](https://cherry-ai.com)" />);
    });

    expect(mockCherryMarkdownText).toHaveBeenCalledWith(
      expect.objectContaining({
        fontSizeStep: 1,
        isStreaming: false,
        markdown: '[Cherry](https://cherry-ai.com)',
      }),
    );
    const onLinkPress = mockCherryMarkdownText.mock.calls[0]?.[0].onLinkPress as
      | ((url: string) => void)
      | undefined;
    act(() => onLinkPress?.('https://cherry-ai.com'));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://cherry-ai.com');
  });

  it('uses an explicit preview step without changing renderer mode', () => {
    act(() => {
      create(<MarkdownText fontSizeStep={2} isStreaming markdown="Preview" />);
    });

    expect(mockCherryMarkdownText).toHaveBeenCalledWith(
      expect.objectContaining({ fontSizeStep: 2, isStreaming: true }),
    );
  });

  it('opens a prefixed citation link as its original external URL', () => {
    act(() => {
      create(<MarkdownText markdown="Citation" />);
    });

    const onLinkPress = mockCherryMarkdownText.mock.calls[0]?.[0].onLinkPress as
      | ((url: string) => void)
      | undefined;
    act(() => onLinkPress?.('cite:https%3A%2F%2Fgoldprice.org%2Fgold-price.html'));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://goldprice.org/gold-price.html');
  });
});
