import type { ComponentType, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import i18n, { initI18n } from '@/frontend/i18n';

import { type ChatDraftModelSetup, ChatDraftState } from '../ChatDraftState';

const mockOpenProviderSetup = jest.fn();
const mockRouterPush = jest.fn();

let mockAllowedModelIds: readonly string[] | undefined;
let mockCanEditProviderSettings = true;
let mockModelPickerData = {
  getModelItem: jest.fn(() => undefined as unknown),
  hasLoadedCatalog: true,
  modelItems: [] as unknown[],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/frontend/appShell/navigation', () => ({
  useOpenProviderSetup: () => mockOpenProviderSetup,
}));

jest.mock('@/frontend/components/Avatar', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    AgentAvatar: ({ name }: { name: string }) =>
      createElement(
        'mock-agent-avatar' as unknown as ComponentType<{
          accessibilityLabel?: string;
          testID?: string;
        }>,
        { accessibilityLabel: name, testID: 'chat-draft-avatar' },
      ),
  };
});

jest.mock('@/frontend/components/ModelPicker', () => ({
  useModelPickerData: () => mockModelPickerData,
}));

jest.mock('@/frontend/components/Policy', () => ({
  useModelChoice: () => ({ allowedModelIds: mockAllowedModelIds }),
}));

jest.mock('@/shared/data/managedPolicy', () => ({
  capabilityPolicy: () => ({
    canEdit: () => mockCanEditProviderSettings,
  }),
}));

jest.mock('../ChatComposerClearance', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    ChatComposerClearance: ({ children }: { children: ReactNode }) =>
      createElement(
        'mock-clearance' as unknown as ComponentType<{ children?: ReactNode }>,
        null,
        children,
      ),
  };
});

jest.mock('@cherrystudio/app-icons/icons/monitor', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/plus', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button: ({
      children,
      onPress,
      shape,
      size,
      testID,
      variant,
    }: {
      children: ReactNode;
      onPress?: () => void;
      shape?: string;
      size?: string;
      testID?: string;
      variant?: string;
    }) =>
      createElement(
        'mock-button' as unknown as ComponentType<Record<string, unknown>>,
        {
          onPress,
          shape,
          size,
          testID,
          variant,
        },
        children,
      ),
  };
});

const defaultModelSetup: ChatDraftModelSetup = {
  modelId: null,
  modelType: 'all',
  returnTo: '/?agentId=assistant-1',
};

describe('ChatDraftState', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeAll(async () => {
    await initI18n('en-US');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAllowedModelIds = undefined;
    mockCanEditProviderSettings = true;
    mockModelPickerData = {
      getModelItem: jest.fn(() => undefined),
      hasLoadedCatalog: true,
      modelItems: [],
    };
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('shows only avatar and greeting when models are available or modelSetup is omitted', async () => {
    mockModelPickerData = {
      getModelItem: jest.fn(() => undefined),
      hasLoadedCatalog: true,
      modelItems: [{ id: 'model-1' }],
    };

    await renderDraftState({ modelSetup: defaultModelSetup });
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(1);
    expect(collectText(renderer!.root)).toBe('What should we create together today?');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-add-provider' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-desktop-sync' })).toHaveLength(0);

    await renderDraftState({ modelSetup: undefined });
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(1);
    expect(collectText(renderer!.root)).toBe('What should we create together today?');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-add-provider' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-desktop-sync' })).toHaveLength(0);
  });

  test('shows only avatar and greeting while the model catalog is still loading', async () => {
    mockModelPickerData = {
      getModelItem: jest.fn(() => undefined),
      hasLoadedCatalog: false,
      modelItems: [],
    };

    await renderDraftState({ modelSetup: defaultModelSetup });

    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(1);
    expect(collectText(renderer!.root)).toBe('What should we create together today?');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-add-provider' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-desktop-sync' })).toHaveLength(0);
  });

  test('opens provider setup only after a pending empty catalog settles', async () => {
    mockModelPickerData.hasLoadedCatalog = false;
    await renderDraftState({ modelSetup: defaultModelSetup });
    expect(collectText(renderer!.root)).toBe('What should we create together today?');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(1);

    mockModelPickerData.hasLoadedCatalog = true;
    await renderDraftState({ modelSetup: defaultModelSetup });
    expect(collectText(renderer!.root)).toContain('Connect a provider');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(0);
  });

  test('shows only avatar and greeting for a managed Agent with organization model choices', async () => {
    mockAllowedModelIds = ['m1'];

    await renderDraftState({ modelSetup: defaultModelSetup });

    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(1);
    expect(collectText(renderer!.root)).toBe('What should we create together today?');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-add-provider' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-desktop-sync' })).toHaveLength(0);
  });

  test('renders provider setup heading and two tonal pill buttons without avatar when unconfigured', async () => {
    await renderDraftState({ modelSetup: defaultModelSetup });

    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(0);
    expect(
      renderer!.root.findAll((node) =>
        String(node.props.testID ?? '').startsWith('chat-draft-provider-'),
      ),
    ).toHaveLength(0);

    const fullText = collectText(renderer!.root);
    expect(fullText).toBe('Connect a providerAdd providerSync from desktop');
    expect(fullText).not.toContain('Add a provider or sync from desktop to start chatting');

    const addButton = renderer!.root.findByProps({ testID: 'chat-draft-add-provider' });
    expect(addButton.props.variant).toBe('tonal');
    expect(addButton.props.shape).toBe('pill');
    expect(addButton.props.size).toBe('sm');
    expect(collectText(addButton)).toBe('Add provider');
    await act(async () => addButton.props.onPress());
    expect(mockOpenProviderSetup).toHaveBeenCalledTimes(1);

    const syncButton = renderer!.root.findByProps({ testID: 'chat-draft-desktop-sync' });
    expect(syncButton.props.variant).toBe('tonal');
    expect(syncButton.props.shape).toBe('pill');
    expect(syncButton.props.size).toBe('sm');
    expect(collectText(syncButton)).toBe('Sync from desktop');
    await act(async () => syncButton.props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/settings/provider/desktop-sync',
      params: { returnTo: defaultModelSetup.returnTo },
    });
  });

  test('shows clean typographic empty copy without avatar or actions when provider editing is disabled', async () => {
    mockCanEditProviderSettings = false;

    await renderDraftState({ modelSetup: defaultModelSetup });

    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-avatar' })).toHaveLength(0);
    expect(collectText(renderer!.root)).toBe('No models available');
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-add-provider' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-draft-desktop-sync' })).toHaveLength(0);
  });

  async function renderDraftState({ modelSetup }: { modelSetup?: ChatDraftModelSetup }) {
    await act(async () => {
      const element = (
        <I18nextProvider i18n={i18n}>
          <ChatDraftState
            assistantName="Cherry Assistant"
            contentBottomInset={24}
            modelSetup={modelSetup}
          />
        </I18nextProvider>
      );
      if (renderer) {
        renderer.update(element);
      } else {
        renderer = create(element);
      }
    });
  }
});

function collectText(instance: ReactTestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : collectText(child)))
    .join('');
}
