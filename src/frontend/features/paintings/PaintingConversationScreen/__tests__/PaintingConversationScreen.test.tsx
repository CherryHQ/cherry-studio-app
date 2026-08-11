import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingConversationScreen } from '../PaintingConversationScreen';

let mockPaintingId: string | undefined = 'painting-1';
const mockRedirect = jest.fn((_props: { href: unknown }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: unknown }) => mockRedirect(props),
  useLocalSearchParams: () => ({ paintingId: mockPaintingId }),
}));

describe('PaintingConversationScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaintingId = 'painting-1';
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('redirects existing conversation links to the unified painting screen', () => {
    act(() => {
      renderer = create(<PaintingConversationScreen />);
    });

    expect(mockRedirect).toHaveBeenCalledWith({
      href: { params: { paintingId: 'painting-1' }, pathname: '/paintings' },
    });
  });

  it('redirects malformed links to a blank painting screen', () => {
    mockPaintingId = undefined;
    act(() => {
      renderer = create(<PaintingConversationScreen />);
    });

    expect(mockRedirect).toHaveBeenCalledWith({ href: { pathname: '/paintings' } });
  });
});
