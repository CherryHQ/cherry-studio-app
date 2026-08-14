import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessagePager } from '../MessagePager';

type PagerProps = {
  children?: ReactNode;
  initialPage?: number;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  scrollEnabled?: boolean;
};

let mockScope: 'conversations' | 'drawings' = 'conversations';
let mockIsEditing = false;
let mockPagerProps: PagerProps | undefined;
const mockSetPage = jest.fn();

jest.mock('@expo/ui/community/pager-view', () => {
  const React = jest.requireActual('react');

  return {
    __esModule: true,
    default: React.forwardRef(function MockPager(props: PagerProps, ref: React.Ref<unknown>) {
      mockPagerProps = props;
      React.useImperativeHandle(ref, () => ({ setPage: mockSetPage }));
      return React.createElement('PagerView', props, props.children);
    }),
  };
});

jest.mock('@/frontend/components/messageTabs', () => ({
  getMessageScopeAtIndex: (index: number) => (index === 1 ? 'drawings' : 'conversations'),
  getMessageScopeIndex: (scope: string) => (scope === 'drawings' ? 1 : 0),
  useMessageScope: () => ({ scope: mockScope }),
  useMessageSelectionState: () => ({ isEditing: mockIsEditing }),
}));

jest.mock('@/frontend/features/paintings', () => ({ DrawingList: () => null }));
jest.mock('@/frontend/features/topics', () => ({ TopicList: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('MessagePager', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockScope = 'conversations';
    mockIsEditing = false;
    mockPagerProps = undefined;
    mockSetPage.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps scope and horizontal paging in sync', () => {
    const onScopeChange = jest.fn();
    act(() => {
      renderer = create(<MessagePager onScopeChange={onScopeChange} />);
    });

    expect(mockPagerProps?.initialPage).toBe(0);
    act(() => mockPagerProps?.onPageSelected?.({ nativeEvent: { position: 1 } }));
    expect(onScopeChange).toHaveBeenCalledWith('drawings');

    mockScope = 'drawings';
    act(() => renderer?.update(<MessagePager onScopeChange={onScopeChange} />));
    expect(mockSetPage).not.toHaveBeenCalled();

    mockScope = 'conversations';
    act(() => renderer?.update(<MessagePager onScopeChange={onScopeChange} />));
    expect(mockSetPage).toHaveBeenCalledWith(0);
  });

  it('disables paging while editing', () => {
    mockIsEditing = true;
    act(() => {
      renderer = create(<MessagePager onScopeChange={jest.fn()} />);
    });

    expect(mockPagerProps?.scrollEnabled).toBe(false);
  });
});
