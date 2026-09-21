import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createApiKeyEntry } from '../../../apiService/utils/providerApiServiceApiKeys';
import { buildCustomProviderCreationPayload } from '../../../apiService/utils/providerApiServiceEndpointRules';
import { useProviderFormDraft } from '../hooks/useProviderFormDraft';
import {
  createEmptyProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
} from '../utils/providerFormValues';

describe('single-protocol provider setup', () => {
  let renderer: ReactTestRenderer;
  let form: ReturnType<typeof useProviderFormDraft>;

  function Probe() {
    form = useProviderFormDraft({
      createInitialValues: createEmptyProviderFormValues,
      endpointTypes: NEW_PROVIDER_ENDPOINT_TYPES,
      isSubmitting: false,
      normalizeCustomEndpoints: true,
      sourceKey: 'new-provider',
    });
    return null;
  }

  beforeEach(() => {
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('saves only the selected protocol and carries the edited URL across switches', () => {
    act(() =>
      form.actions.setEndpointUrl('openai-chat-completions', 'https://example.com/gateway#'),
    );
    act(() => form.actions.replaceTextEndpoint('openai-responses'));
    act(() => form.actions.setEndpointUrl('openai-responses', 'https://new.example.com/v1'));
    act(() => form.actions.replaceTextEndpoint('openai-chat-completions'));

    expect(
      buildCustomProviderCreationPayload({
        endpointUrls: form.state.endpointUrls,
        preferredChatEndpoint: form.state.defaultChatEndpoint,
      }),
    ).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://new.example.com/v1' } },
    });
  });

  it('keeps the selected protocol when its only URL is cleared and retyped', () => {
    act(() => form.actions.replaceTextEndpoint('openai-responses'));
    act(() => form.actions.setEndpointUrl('openai-responses', 'https://example.com/v1'));
    act(() => form.actions.setEndpointUrl('openai-responses', ''));
    expect(form.state.defaultChatEndpoint).toBe('openai-responses');
    expect(form.state.endpointUrls['openai-chat-completions']).toBeUndefined();
    act(() => form.actions.setEndpointUrl('openai-responses', 'https://next.example.com/v1'));
    expect(form.state.defaultChatEndpoint).toBe('openai-responses');
  });

  it('retains the remaining key identity, label, and disabled state after deleting the first key', () => {
    const remaining = { id: 'b', key: 'sk-b', label: 'Backup', isEnabled: false };
    act(() =>
      form.actions.reset({
        ...createEmptyProviderFormValues(),
        name: 'Provider',
        apiKeys: [{ id: 'a', key: 'sk-a', label: 'Primary', isEnabled: true }, remaining],
      }),
    );

    act(() => form.actions.removeApiKey('a'));
    expect(form.state.apiKeys).toEqual([remaining]);
    expect(form.state.apiKeys[0]).toBe(remaining);
    expect(form.meta.isDirty).toBe(true);

    act(() => form.actions.updateApiKey('b', { key: 'sk-b-updated', label: '' }));
    expect(form.state.apiKeys).toEqual([{ ...remaining, key: 'sk-b-updated', label: '' }]);
  });

  it('adds enabled keys with independent identities and restores a clean draft when an addition is removed', () => {
    act(() => form.actions.addApiKey(createApiKeyEntry()));
    const first = form.state.apiKeys[0];
    act(() => form.actions.addApiKey(createApiKeyEntry()));
    const second = form.state.apiKeys[1];
    expect(first.id).not.toBe(second.id);
    expect(first.isEnabled).toBe(true);
    expect(second.isEnabled).toBe(true);
    expect(form.meta.isDirty).toBe(true);

    act(() => {
      form.actions.removeApiKey(first.id);
      form.actions.removeApiKey(second.id);
    });
    expect(form.state.apiKeys).toEqual([]);
    expect(form.meta.isDirty).toBe(false);
  });

  it('blocks blank or duplicate rows until they are corrected or removed', () => {
    act(() => {
      form.actions.setName('Provider');
      form.actions.addApiKey(createApiKeyEntry());
    });
    const firstId = form.state.apiKeys[0].id;
    expect(form.meta.canSubmit).toBe(false);
    act(() => form.actions.updateApiKey(firstId, { key: 'sk-a' }));
    expect(form.meta.canSubmit).toBe(true);

    act(() => form.actions.addApiKey(createApiKeyEntry()));
    const secondId = form.state.apiKeys[1].id;
    act(() => form.actions.updateApiKey(secondId, { key: ' sk-a ', isEnabled: false }));
    expect(form.meta.canSubmit).toBe(false);
    act(() => form.actions.updateApiKey(secondId, { key: 'sk-b' }));
    expect(form.meta.canSubmit).toBe(true);
    expect(form.state.apiKeys[0].key).toBe('sk-a');
  });

  it('includes label-only and enabled-state edits in unsaved-change tracking', () => {
    const initial = {
      ...createEmptyProviderFormValues(),
      apiKeys: [{ id: 'a', key: 'sk-a', label: 'Primary', isEnabled: true }],
    };
    act(() => form.actions.reset(initial));
    act(() => form.actions.updateApiKey('a', { label: 'Work' }));
    expect(form.meta.isDirty).toBe(true);
    act(() => form.actions.updateApiKey('a', { label: 'Primary' }));
    expect(form.meta.isDirty).toBe(false);
    act(() => form.actions.updateApiKey('a', { isEnabled: false }));
    expect(form.meta.isDirty).toBe(true);
    act(() => form.actions.reset(initial));
    expect(form.state.apiKeys).toEqual(initial.apiKeys);
    expect(form.meta.isDirty).toBe(false);
  });
});
