import MaskedView from '@react-native-masked-view/masked-view';
import { type PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatShareSelectionRow } from '../ChatShareControls';

jest.mock('@react-native-masked-view/masked-view', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  BackgroundPressArea: ({ children }: PropsWithChildren) => children,
  BackgroundPressExclusion: ({ children }: PropsWithChildren) => children,
  SelectionIndicator: () => null,
}));
jest.mock('@/frontend/appShell/navigation', () => ({}));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => 'black' }));
jest.mock('../../components/ChatWorkspace/context/ChatMessageRowContext', () => ({
  useChatMessageRow: () => ({}),
}));
jest.mock('../ChatShareDragSelection', () => ({ useChatShareDragRow: () => undefined }));
jest.mock('../chatShareSelection', () => ({
  useChatShareSelectionActions: () => ({}),
  useChatShareSelectionState: () => ({}),
  useIsChatMessageSelected: () => false,
  useIsChatShareSelecting: () => true,
}));

test.each(['user', 'assistant'] as const)('bounds selection masks for a long %s row', (role) => {
  let row!: ReactTestRenderer;
  act(() => {
    row = create(
      <ChatShareSelectionRow message={{ data: {}, id: 'long', role, status: 'success' }}>
        <Text>{'line\n'.repeat(2000)}</Text>
      </ChatShareSelectionRow>,
    );
  });
  try {
    const masks = row.root.findAllByType(MaskedView);
    if (role === 'user') {
      expect(masks).toHaveLength(0);
    } else {
      expect(masks).toHaveLength(1);
      expect(StyleSheet.flatten(masks[0]!.props.style).maxHeight).toBe(234);
    }
  } finally {
    act(() => row.unmount());
  }
});
