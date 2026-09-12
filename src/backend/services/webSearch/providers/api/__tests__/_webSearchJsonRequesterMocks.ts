import type {
  WebSearchJsonRequest,
  WebSearchJsonRequester,
} from '../../../http/requestWebSearchJson';

export type MockWebSearchJsonRequester = jest.MockedFunction<WebSearchJsonRequester>;

export function createMockJsonRequester(payload: unknown): MockWebSearchJsonRequester {
  const requester = jest.fn(async (request: WebSearchJsonRequest<unknown>) =>
    request.responseSchema.parse(payload),
  );

  return requester as unknown as MockWebSearchJsonRequester;
}

export function createRejectedJsonRequester(error: Error): MockWebSearchJsonRequester {
  return jest.fn().mockRejectedValue(error) as unknown as MockWebSearchJsonRequester;
}
