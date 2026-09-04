import { createCustomParamsFetch } from '../customParamsFetch';

function createInnerFetch() {
  return jest.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
}

describe('createCustomParamsFetch', () => {
  it('passes unsupported request bodies through unchanged', async () => {
    const innerFetch = createInnerFetch();
    const invalidJson: RequestInit = { method: 'POST', body: 'not-json{{{' };

    await createCustomParamsFetch(innerFetch, { service_tier: 'priority' })(
      'https://example.com',
      invalidJson,
    );

    expect(innerFetch).toHaveBeenCalledWith('https://example.com', invalidJson);
  });

  it('injects registry parameters below SDK-produced fields', async () => {
    const innerFetch = createInnerFetch();
    const wrappedFetch = createCustomParamsFetch(innerFetch, {
      model: 'registry-model',
      service_tier: 'priority',
    });

    await wrappedFetch('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ messages: [], model: 'sdk-model' }),
    });

    const forwardedInit = innerFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(forwardedInit.body as string)).toEqual({
      messages: [],
      model: 'sdk-model',
      service_tier: 'priority',
    });
  });

  it('reuses wrappers for the same fetch and parameters', () => {
    const innerFetch = createInnerFetch();
    const first = createCustomParamsFetch(innerFetch, { service_tier: 'priority' });
    const second = createCustomParamsFetch(innerFetch, { service_tier: 'priority' });

    expect(second).toBe(first);
  });
});
