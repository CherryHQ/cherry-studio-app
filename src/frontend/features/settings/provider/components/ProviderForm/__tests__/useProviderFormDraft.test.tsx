import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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
});
