import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatHeader } from '../ChatHeader';

let mockSessionId: string;
let mockAgent: { id: string } | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () =>
  jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/appShell/header', () => ({
  MainHeader: (props: object) => jest.requireActual('react').createElement('Header', props),
}));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: (id?: string) => ({ data: id ? { id, agentId: 'deleted-agent' } : undefined }),
  useAgentApiById: () => ({ agent: mockAgent, isLoading: false }),
}));
jest.mock('@/frontend/hooks/file', () => ({
  useFileWorkspace: () => ({ folderId: 'folder', workspace: { name: 'Documents' } }),
}));
jest.mock('../FileWorkspaceSheet', () => ({
  FileWorkspaceSheet: (props: object) =>
    jest.requireActual('react').createElement('WorkspaceSheet', props),
}));

let renderer: ReactTestRenderer;
const mount = () => {
  renderer = create(<ChatHeader blurTarget={{ current: null }} />);
};
const header = () => renderer.root.findByType('Header' as never).props;
const workspace = () => renderer.root.findByType('WorkspaceSheet' as never).props;

beforeEach(() => {
  mockSessionId = 'history-session';
  mockAgent = undefined;
});
afterEach(() => act(() => renderer.unmount()));

test('opens and closes the workspace of a history chat after its Agent was deleted', () => {
  act(mount);
  const action = header().actions.find((item: { key: string }) => item.key === 'file-workspace');
  act(() => action.onPress());
  expect(workspace().open).toBe(true);
  expect(workspace().address).toEqual({ sessionId: 'history-session' });
  act(() => workspace().onClose());
  expect(workspace().open).toBe(false);
});

test('does not carry an open workspace into another history chat', () => {
  act(mount);
  act(() => header().actions[0].onPress());
  mockSessionId = 'other-session';
  act(() => renderer.update(<ChatHeader blurTarget={{ current: null }} />));
  expect(workspace().address).toEqual({ sessionId: 'other-session' });
  expect(workspace().open).toBe(false);
});

test('keeps workspace access in the composer when the Agent is available', () => {
  mockAgent = { id: 'current-agent' };
  act(mount);
  expect(header().actions).toBeUndefined();
  expect(renderer.root.findAllByType('WorkspaceSheet' as never)).toHaveLength(0);
});
