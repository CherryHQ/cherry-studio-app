import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { EndpointConfigs, Provider } from '@/shared/data/types/provider';

import { getProviderApiServiceEndpointDirtyState } from '../../utils/providerApiServiceDirtyState';
import { useProviderApiServiceEndpointDraft } from '../useProviderApiServiceEndpointDraft';

type EndpointDraftApi = ReturnType<typeof useProviderApiServiceEndpointDraft>;

function createProvider(endpointConfigs: EndpointConfigs): Provider {
  return {
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs,
    id: 'provider-1',
    name: 'Provider One',
  } as unknown as Provider;
}

const persistedProvider = createProvider({
  'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
});

describe('useProviderApiServiceEndpointDraft', () => {
  let renderer: ReactTestRenderer | undefined;
  let draftApi: EndpointDraftApi | undefined;

  function Probe({ provider }: { provider: Provider }) {
    draftApi = useProviderApiServiceEndpointDraft(provider);
    return null;
  }

  function mount(provider: Provider) {
    act(() => {
      renderer = create(<Probe provider={provider} />);
    });

    return current();
  }

  function refetch(provider: Provider) {
    act(() => {
      renderer?.update(<Probe provider={provider} />);
    });
  }

  function current() {
    if (!draftApi) {
      throw new Error('Endpoint draft was not rendered.');
    }

    return draftApi;
  }

  function isDirty(provider: Provider) {
    return getProviderApiServiceEndpointDirtyState({ draft: current().draft, provider });
  }

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    draftApi = undefined;
  });

  it('mirrors the persisted endpoint configs on the first frame', () => {
    expect(mount(persistedProvider).draft).toEqual({
      baseUrlByEndpoint: { 'openai-chat-completions': 'https://chat.example.com' },
      primaryEndpoint: 'openai-chat-completions',
      visibleEndpointTypes: ['openai-chat-completions'],
    });
    expect(isDirty(persistedProvider)).toBe(false);
  });

  it('keeps an uncommitted base URL when the provider refetches', () => {
    mount(persistedProvider);

    act(() => current().updateBaseUrl('openai-chat-completions', 'https://local-edit.example.com'));
    refetch(createProvider({ 'openai-chat-completions': { baseUrl: 'https://elsewhere.test' } }));

    expect(current().draft.baseUrlByEndpoint['openai-chat-completions']).toBe(
      'https://local-edit.example.com',
    );
    expect(
      isDirty(createProvider({ 'openai-chat-completions': { baseUrl: 'https://elsewhere.test' } })),
    ).toBe(true);
  });

  it('settles clean once the saved provider comes back from the query', () => {
    mount(persistedProvider);

    act(() => current().updateBaseUrl('openai-chat-completions', 'https://saved.example.com'));
    expect(isDirty(persistedProvider)).toBe(true);

    const savedProvider = createProvider({
      'openai-chat-completions': { baseUrl: 'https://saved.example.com' },
    });
    refetch(savedProvider);

    expect(isDirty(savedProvider)).toBe(false);
  });

  it('rebuilds from the persisted configs when the screen is reopened', () => {
    mount(persistedProvider);
    act(() => current().updateBaseUrl('openai-chat-completions', 'https://abandoned.example.com'));
    act(() => renderer?.unmount());

    expect(mount(persistedProvider).draft.baseUrlByEndpoint['openai-chat-completions']).toBe(
      'https://chat.example.com',
    );
  });

  it('keeps a blank added endpoint visible without counting it as unsaved work', () => {
    mount(persistedProvider);

    act(() => current().addEndpoint('anthropic-messages'));

    expect(current().draft.visibleEndpointTypes).toEqual([
      'openai-chat-completions',
      'anthropic-messages',
    ]);
    expect(current().draft.baseUrlByEndpoint['anthropic-messages']).toBe('');
    expect(isDirty(persistedProvider)).toBe(false);
  });

  it('ignores adding an endpoint that is already visible or not configurable', () => {
    mount(persistedProvider);

    act(() => current().addEndpoint('openai-chat-completions'));
    act(() => current().addEndpoint('ollama-chat'));

    expect(current().draft.visibleEndpointTypes).toEqual(['openai-chat-completions']);
  });

  it('removes a secondary endpoint but never the primary one', () => {
    mount(
      createProvider({
        'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
      }),
    );

    act(() => current().removeEndpoint('anthropic-messages'));
    expect(current().draft.visibleEndpointTypes).toEqual(['openai-chat-completions']);
    expect(current().draft.baseUrlByEndpoint['anthropic-messages']).toBeUndefined();

    act(() => current().removeEndpoint('openai-chat-completions'));
    expect(current().draft.visibleEndpointTypes).toEqual(['openai-chat-completions']);
  });

  it('changes the primary endpoint only after that endpoint has a Base URL', () => {
    mount(persistedProvider);

    act(() => current().addEndpoint('anthropic-messages'));
    act(() => current().updatePrimaryEndpoint('anthropic-messages'));
    expect(current().draft.primaryEndpoint).toBe('openai-chat-completions');

    act(() => current().updateBaseUrl('anthropic-messages', 'https://anthropic.example.com'));
    act(() => current().updatePrimaryEndpoint('anthropic-messages'));

    expect(current().draft.primaryEndpoint).toBe('anthropic-messages');
    expect(isDirty(persistedProvider)).toBe(true);
  });
});
