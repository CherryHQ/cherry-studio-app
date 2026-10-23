import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';

import { FileLibrarySelectionControls } from '../FileLibrarySelectionControls';

const mockTrigger = jest.fn();
const mockToastShow = jest.fn();
const refresh = jest.fn(async () => undefined);

jest.mock('@/frontend/data', () => ({ useMutation: () => ({ trigger: mockTrigger }) }));
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: {} }),
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en-US' } }),
}));
jest.mock('@/frontend/components/Selection/SelectionToolbar/SelectionToolbar', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');
  return {
    SelectionToolbar: ({ actions }: { actions: { id: string; onPress: () => void }[] }) =>
      actions.map((action) => (
        <MockPressable key={action.id} onPress={action.onPress} testID={`selection-${action.id}`} />
      )),
  };
});
jest.mock('@/frontend/components/FileFolderPicker', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');
  return {
    FileFolderPicker: ({
      onClose,
      onSelect,
    }: {
      onClose: () => void;
      onSelect: (id: string | null) => void;
    }) => (
      <>
        <MockPressable onPress={onClose} testID="picker-close" />
        <MockPressable onPress={() => onSelect(null)} testID="picker-root" />
      </>
    ),
  };
});

let actions: ReturnType<typeof useSelectionActions>;
let state: ReturnType<typeof useSelectionState>;
let renderer: ReactTestRenderer;

function Probe() {
  const currentActions = useSelectionActions();
  const currentState = useSelectionState();
  useEffect(() => {
    actions = currentActions;
    state = currentState;
  }, [currentActions, currentState]);
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockTrigger.mockReset();
  await act(async () => {
    renderer = create(
      <SelectionProvider>
        <Probe />
        <FileLibrarySelectionControls refresh={refresh} />
      </SelectionProvider>,
    );
  });
  act(() => {
    actions.enterEditing();
    actions.selectIds(['first', 'second', 'third']);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

it('keeps the selection and performs no moves when the destination picker is cancelled', async () => {
  await press('selection-move');
  await press('picker-close');
  expect(state.selectedIds).toEqual(new Set(['first', 'second', 'third']));
  expect(state.isEditing).toBe(true);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ testID: 'picker-root' })).toHaveLength(0);
});

it('keeps only failed entries selected and retries them without resubmitting completed files', async () => {
  mockTrigger.mockResolvedValueOnce([
    { fileEntryId: 'first', status: 'moved' },
    { fileEntryId: 'second', status: 'unchanged' },
    { fileEntryId: 'third', status: 'failed', code: 'NOT_FOUND' },
  ]);
  await press('selection-move');
  await press('picker-root');
  expect(state.selectedIds).toEqual(new Set(['third']));
  expect(state.isEditing).toBe(true);
  expect(mockToastShow).toHaveBeenLastCalledWith({
    label: 'library.selection.moveResultUnavailable',
    variant: 'danger',
  });
  expect(refresh).toHaveBeenCalledTimes(1);

  mockTrigger.mockResolvedValueOnce([{ fileEntryId: 'third', status: 'moved' }]);
  await press('selection-move');
  await press('picker-root');
  expect(mockTrigger).toHaveBeenLastCalledWith({
    body: { fileEntryIds: ['third'], folderId: null },
  });
  expect(state.selectedIds.size).toBe(0);
  expect(state.isEditing).toBe(false);
  expect(mockToastShow).toHaveBeenLastCalledWith({
    label: 'library.selection.moveResult',
    variant: 'success',
  });
  expect(refresh).toHaveBeenCalledTimes(2);
});

async function press(testID: string) {
  await act(async () => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
}
