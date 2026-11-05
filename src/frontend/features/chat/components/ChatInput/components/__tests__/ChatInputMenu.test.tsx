import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatRouteParamsInput } from '@/frontend/appShell/navigation/chat';

import { ChatInputMenu } from '../ChatInputMenu';

let mockParams: ChatRouteParamsInput;
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockFocus = jest.fn();
const mockCamera = jest.fn();
const mockPhotos = jest.fn();
const mockUpload = jest.fn();
const mockReplaceInput = jest.fn(async (present: () => void) => present());

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () =>
  jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => ({
  BottomSheet: ({ children, open, ...props }: { children: ReactNode; open: boolean }) =>
    jest.requireActual('react').createElement('Sheet', { ...props, open }, open ? children : null),
  Composer: {
    Action: (props: object) => jest.requireActual('react').createElement('Action', props),
  },
  Image: () => null,
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerMeta: () => ({ inputRef: { current: { focus: mockFocus } } }),
  useComposerPresentationActions: () => ({ runInputReplacement: mockReplaceInput }),
  useComposerMediaActions: () => ({ openCamera: mockCamera, openPhotoLibrary: mockPhotos }),
  useComposerDocumentPicker: () => mockUpload,
}));
jest.mock('@/frontend/hooks/file', () => ({ useFileWorkspace: () => ({}) }));
jest.mock('@/frontend/hooks/mcp/useMcpIcon', () => ({ useMcpIcon: () => undefined }));
jest.mock('../ChatInputPluginSheet', () => ({ ChatInputPluginSheet: () => null }));
jest.mock('../ChatInputPromptSheet', () => ({ ChatInputPromptSheet: () => null }));
jest.mock('../ChatInputSkillSheet', () => ({
  ChatInputSkillSheet: (props: object) =>
    jest.requireActual('react').createElement('SkillSheet', props),
}));
jest.mock('../FilePickerBottomSheet', () => ({ FilePickerBottomSheet: () => null }));
jest.mock('../../../FileWorkspaceSheet', () => ({
  FileWorkspaceSheet: (props: object) =>
    jest.requireActual('react').createElement('WorkspaceSheet', props),
}));

let renderer: ReactTestRenderer;
const menu = () => renderer.root.findByType('Sheet' as never).props;
const trigger = () => renderer.root.findByType('Action' as never).props;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { agentId: 'agent-b' };
  mockReplaceInput.mockImplementation(async (present) => present());
  mockCamera.mockResolvedValue(undefined);
});
afterEach(() => act(() => renderer.unmount()));

async function mount(media: 'all' | 'images' = 'all') {
  await act(async () => {
    renderer = create(
      <ChatInputMenu agentId="agent-b" enabled media={media} prompts={[]} skillAgentId="agent-b" />,
    );
  });
}

test.each([{ agentId: 'agent-b' }, { sessionId: 'session-b' }])(
  'retains the chat target %j when adding a Skill after both sheets close',
  async (params) => {
    mockParams = params;
    await mount();
    await act(async () => trigger().onPress());
    act(() => renderer.root.findByProps({ testID: 'chat-composer-skills' }).props.onPress());
    act(() => renderer.root.findByType('SkillSheet' as never).props.onAdd());
    expect(mockPush).not.toHaveBeenCalled();
    act(() => menu().onClosed());
    expect(mockPush).not.toHaveBeenCalled();
    act(() => renderer.root.findByType('SkillSheet' as never).props.onClosed());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/skills', params });
  },
);

test('keeps workspace selection available in the image-only tools menu', async () => {
  mockParams = { sessionId: 'image-session' };
  await mount('images');
  await act(async () => trigger().onPress());
  act(() => renderer.root.findByProps({ testID: 'chat-file-workspace' }).props.onPress());
  const workspace = renderer.root.findByType('WorkspaceSheet' as never).props;
  expect(workspace.open).toBe(true);
  expect(workspace.address).toEqual({ sessionId: 'image-session' });
  act(() => workspace.onClose());
  expect(menu().open).toBe(true);
  expect(renderer.root.findAllByType('WorkspaceSheet' as never)).toHaveLength(0);
});

test('does not reverse a pending close or replay its media action on a later close', async () => {
  await mount();
  await act(async () => trigger().onPress());
  act(() => renderer.root.findByProps({ accessibilityLabel: 'chat.media.camera' }).props.onPress());
  expect(menu().open).toBe(false);
  expect(mockCamera).not.toHaveBeenCalled();
  await act(async () => trigger().onPress());
  expect(mockReplaceInput).toHaveBeenCalledTimes(1);
  expect(menu().open).toBe(false);
  await act(async () => menu().onClosed());
  expect(mockCamera).toHaveBeenCalledTimes(1);
  await act(async () => trigger().onPress());
  expect(menu().open).toBe(true);
  act(() => menu().onClose());
  act(() => menu().onClosed());
  expect(mockCamera).toHaveBeenCalledTimes(1);
});

test('discards an opening queued before a completed close', async () => {
  const openings: (() => void)[] = [];
  mockReplaceInput.mockImplementation(async (present) => {
    openings.push(present);
  });
  await mount();
  await act(async () => {
    trigger().onPress();
    trigger().onPress();
  });
  act(() => openings[0]());
  act(() => renderer.root.findByProps({ accessibilityLabel: 'chat.media.camera' }).props.onPress());
  await act(async () => menu().onClosed());
  expect(mockCamera).toHaveBeenCalledTimes(1);
  act(() => openings[1]());
  expect(menu().open).toBe(false);
});
