import { readErrorPartDetail } from '../errorPartDetail';

describe('readErrorPartDetail', () => {
  test('keeps only the facts that exist, in reading order', () => {
    expect(
      readErrorPartDetail({
        code: 'EXECUTION_FAILED',
        message: '  OpenAI API error (403): access denied  ',
        reasonCode: 'permission',
        retryable: false,
        source: { layer: 'provider', code: 'access_denied' },
        context: { statusCode: 403, modelId: 'gpt-test', finishReason: '' },
      }),
    ).toEqual({
      message: 'OpenAI API error (403): access denied',
      facts: [
        { labelKey: 'chat.errorPart.detail.reason', value: 'permission' },
        { labelKey: 'chat.errorPart.detail.source', value: 'provider \u00B7 access_denied' },
        { labelKey: 'chat.errorPart.detail.status', value: 403 },
        { labelKey: 'chat.errorPart.detail.model', value: 'gpt-test' },
      ],
    });
  });

  test('falls back to the serialized error name and tolerates missing snapshot fields', () => {
    expect(
      readErrorPartDetail({
        code: 'EXECUTION_FAILED',
        message: '',
        name: 'TypeError',
        retryable: false,
        source: 'not-a-record',
        context: { statusCode: '500' },
      }),
    ).toEqual({
      facts: [{ labelKey: 'chat.errorPart.detail.name', value: 'TypeError' }],
    });
  });
});
