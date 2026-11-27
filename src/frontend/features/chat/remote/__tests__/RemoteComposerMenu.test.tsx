import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  useConversationWorkspaces,
  WorkspaceRef,
  WorkspaceSummary,
} from '@/frontend/appShell/conversation';

import { REMOTE_MAX_ATTACHMENTS, RemoteComposerMenu } from '../RemoteComposerMenu';

const mockFocus = jest.fn();
const mockCamera = jest.fn();
const mockPhotos = jest.fn();
const mockUpload = jest.fn();
const mockReplaceInput = jest.fn(async (present: () => void) => present());

jest.mock('@cherrystudio/app-icons/icons/camera', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/file-text', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/folder', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/images', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/plus', () => () => null);

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    BottomSheet: ({ children, open, ...props }: { children: ReactNode; open: boolean }) =>
      React.createElement('Sheet', { ...props, open }, open ? children : null),
    Button: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('Button', props, children),
    Composer: {
      Action: (props: object) => React.createElement('Action', props),
    },
    ContentState: {
      Error: () => null,
      Loading: () => null,
    },
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

jest.mock('@/frontend/components/Composer', () => ({
  useComposerMeta: () => ({ inputRef: { current: { focus: mockFocus } } }),
  useComposerPresentationActions: () => ({ runInputReplacement: mockReplaceInput }),
  useComposerMediaActions: () => ({ openCamera: mockCamera, openPhotoLibrary: mockPhotos }),
  useComposerDocumentPicker: () => mockUpload,
}));

jest.mock('../../components/ChatInput/ChatInput', () => ({ ChatInput: () => null }));
jest.mock('../../components/ChatInput/ChatInputSurface', () => ({
  ChatInputAccessories: () => null,
  ChatInputSurface: () => null,
}));
jest.mock('../../components/ChatInput/components/FilePickerBottomSheet', () => ({
  FilePickerBottomSheet: (props: object) =>
    jest.requireActual('react').createElement('FilePickerSheet', props),
}));

const systemWorkspace: WorkspaceSummary = {
  kind: 'system',
  ref: 'ws-system' as WorkspaceRef,
};
const projectWorkspace: WorkspaceSummary = {
  id: 'ws-project',
  name: 'Project Repo',
  ref: 'ws-project' as WorkspaceRef,
};

function makeWorkspaces(items: WorkspaceSummary[]): ReturnType<typeof useConversationWorkspaces> {
  return {
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    isSuccess: true,
    items,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useConversationWorkspaces>;
}

let renderer: ReactTestRenderer;
const trigger = () => renderer.root.findByProps({ testID: 'composer-menu' }).props;
const toolsSheet = () => renderer.root.findByProps({ testID: 'chat-tools-sheet' }).props;
const workspaceHost = () =>
  renderer.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'remote-composer-workspace',
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockReplaceInput.mockImplementation(async (present) => present());
  mockCamera.mockResolvedValue(undefined);
});

afterEach(() => act(() => renderer.unmount()));

async function mount(props: Partial<Parameters<typeof RemoteComposerMenu>[0]> = {}) {
  await act(async () => {
    renderer = create(
      <RemoteComposerMenu
        attachmentsCount={0}
        canChangeWorkspace
        enabled
        onSelectWorkspace={jest.fn()}
        selectedWorkspace={systemWorkspace}
        showWorkspaceRow
        supportsAttachments
        workspaceValue="Default PC workspace"
        workspaces={makeWorkspaces([systemWorkspace, projectWorkspace])}
        {...props}
      />,
    );
  });
}

test('renders media tiles, configures FilePickerBottomSheet without folder creation, and shows workspace value', async () => {
  await mount();
  await act(async () => trigger().onPress());

  expect(renderer.root.findByProps({ accessibilityLabel: 'chat.media.camera' })).toBeTruthy();
  expect(renderer.root.findByProps({ accessibilityLabel: 'chat.media.photos' })).toBeTruthy();
  const fileTile = renderer.root.findByProps({ accessibilityLabel: 'chat.media.file' });
  expect(fileTile).toBeTruthy();

  const workspaceRow = renderer.root.findByProps({ testID: 'remote-composer-workspace' });
  expect(workspaceRow.props.value).toBe('Default PC workspace');
  expect(workspaceHost().props.accessibilityRole).toBe('button');

  act(() => fileTile.props.onPress());
  const filePicker = renderer.root.findByType('FilePickerSheet' as never).props;
  expect(filePicker.allowCreateFolder).toBe(false);
  expect(filePicker.maxAttachments).toBe(REMOTE_MAX_ATTACHMENTS);
  expect(filePicker.open).toBe(true);
});

test('omits media tiles when supportsAttachments is false while keeping the workspace row reachable', async () => {
  await mount({ supportsAttachments: false });
  await act(async () => trigger().onPress());

  expect(renderer.root.findAllByProps({ accessibilityLabel: 'chat.media.camera' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'chat.media.photos' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'chat.media.file' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'remote-composer-workspace' })).toBeTruthy();
});

test('disables media tiles when attachmentsCount reaches REMOTE_MAX_ATTACHMENTS', async () => {
  await mount({ attachmentsCount: REMOTE_MAX_ATTACHMENTS });
  await act(async () => trigger().onPress());

  for (const label of ['chat.media.camera', 'chat.media.photos', 'chat.media.file']) {
    const tile = renderer.root.findByProps({ accessibilityLabel: label });
    expect(tile.props.disabled).toBe(true);
    expect(tile.props.accessibilityState).toEqual({ disabled: true });
  }
});

test('opens RemoteWorkspaceSheet as an overlay, selects a workspace, and returns to the tools menu', async () => {
  const onSelectWorkspace = jest.fn();
  await mount({ onSelectWorkspace });
  await act(async () => trigger().onPress());

  expect(toolsSheet().active).toBe(true);
  act(() => renderer.root.findByProps({ testID: 'remote-composer-workspace' }).props.onPress());

  const workspaceSheet = renderer.root.findByProps({ testID: 'remote-workspace-sheet' });
  expect(workspaceSheet.props.open).toBe(true);
  expect(workspaceSheet.props.presentation).toBe('overlay');
  expect(toolsSheet().active).toBe(false);

  act(() =>
    renderer.root.findByProps({ testID: 'remote-workspace-option-ws-project' }).props.onPress(),
  );

  expect(onSelectWorkspace).toHaveBeenCalledWith(projectWorkspace);
  expect(renderer.root.findAllByProps({ testID: 'remote-workspace-sheet' })).toHaveLength(0);
  expect(toolsSheet().open).toBe(true);
  expect(toolsSheet().active).toBe(true);
});

test('renders the workspace row as read-only when canChangeWorkspace is false', async () => {
  await mount({ canChangeWorkspace: false });
  await act(async () => trigger().onPress());

  const workspaceRow = renderer.root.findByProps({ testID: 'remote-composer-workspace' });
  const host = workspaceHost();
  expect(workspaceRow.props.onPress).toBeUndefined();
  expect(host.props.accessible).toBe(true);
  expect(host.props.accessibilityRole).toBeUndefined();
  expect(host.props.accessibilityLabel).toBe('remoteAgent.workspaceLabel, Default PC workspace');
  expect(renderer.root.findAllByProps({ testID: 'remote-workspace-sheet' })).toHaveLength(0);
});
