import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { ErrorPart } from '../ErrorPart';
import { MessageFailureReportProvider } from '../MessageFailureReportContext';

jest.mock('@/frontend/data', () => ({
  useQuery: () => ({ data: [{ id: 'deepseek', name: 'DeepSeek' }] }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { provider?: string }) =>
      typeof params?.provider === 'string' ? `${key}:${params.provider}` : key,
  }),
}));

jest.mock('@/frontend/components/MessageDetail', () => {
  const { createElement } = jest.requireActual('react');
  return {
    MessageDetailText: (props: object) => createElement('MessagePartTextSection', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: Object.assign((props: object) => createElement('Button', props), {
      Label: (props: object) => createElement('ButtonLabel', props),
    }),
    ContextMenuExclusion: (props: object) => createElement('View', props),
    MessagePart: {
      Detail: (props: object) => createElement('MessagePartDetail', props),
      Error: (props: object) => createElement('MessagePartError', props),
      TextSection: (props: object) => createElement('MessagePartTextSection', props),
      ValueSection: (props: object) => createElement('MessagePartValueSection', props),
    },
  };
});

type ErrorPartInput = Extract<CherryMessagePart, { type: 'data-error' }>;

function errorPart(data: ErrorPartInput['data']): ErrorPartInput {
  return { type: 'data-error', data } as ErrorPartInput;
}

describe('ErrorPart', () => {
  test('renders actionable local copy instead of provider diagnostics for auth failures', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: 'Incorrect API key provided: sk-***',
          reasonCode: 'auth',
          retryable: false,
          source: { layer: 'provider', code: 'invalid_api_key' },
        })}
      />,
    );

    const props = renderer.root.findByType('MessagePartError').props;
    expect(props.title).toBe('chat.errorPart.reason.auth');
    expect(props.message).toBe('chat.errorPart.message.auth');
  });

  test.each([
    [
      {
        reasonCode: 'unknown',
        source: { layer: 'provider', code: 'non_streaming_mode_unsupported' },
      },
      'streamingRequired',
      'streamingRequired',
    ],
    [
      { reasonCode: 'quota', context: { providerId: 'deepseek' } },
      'quota',
      'providerQuota:DeepSeek',
    ],
    [{ reasonCode: 'quota', context: { providerId: 'removed' } }, 'quota', 'quota'],
    [{ reasonCode: 'model_not_found' }, 'modelNotFound', 'modelNotFound'],
    [{ reasonCode: 'payload_too_large' }, 'payloadTooLarge', 'payloadTooLarge'],
    [
      { reasonCode: 'network', source: { layer: 'provider', code: 'stream_disconnected' } },
      'streamInterrupted',
      'streamInterrupted',
    ],
    [
      {
        reasonCode: 'unknown',
        source: { layer: 'provider', code: 'invalid_request_error' },
        context: { statusCode: 400 },
      },
      'requestRejected',
      'requestRejected',
    ],
  ] as const)('uses the confirmed failure facts for %j', (data, title, message) => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: 'Private provider response',
          retryable: true,
          ...data,
        })}
      />,
    );
    const props = renderer.root.findByType('MessagePartError').props;
    expect(props.title).toBe(`chat.errorPart.reason.${title}`);
    expect(props.message).toBe(`chat.errorPart.message.${message}`);
  });

  test.each([true, false])(
    'offers context reduction before retrying an oversized input (retryable: %s)',
    (retryable) => {
      const renderer = render(
        <ErrorPart
          part={errorPart({
            code: 'EXECUTION_FAILED',
            message: 'Request failed',
            reasonCode: 'context_length',
            retryable,
            source: { layer: 'provider', code: 'input_too_long' },
          })}
        />,
      );

      const props = renderer.root.findByType('MessagePartError').props;
      expect(props.title).toBe('chat.errorPart.reason.contextLength');
      expect(props.message).toBe('chat.errorPart.message.contextLength');
    },
  );

  test('replaces app-owned diagnostic messages with translated copy', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: 'The runtime ended without a terminal event.',
          reasonCode: 'internal',
          retryable: false,
          source: { layer: 'host', code: 'missing_terminal_event' },
        })}
      />,
    );

    const props = renderer.root.findByType('MessagePartError').props;
    expect(props.title).toBe('chat.errorPart.reason.internal');
    expect(props.message).toBe('chat.errorPart.message');
  });

  test('tells the user a retryable failure can be retried', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: 'Stream ended early.',
          reasonCode: 'stream_interrupted',
          retryable: true,
          source: { layer: 'runtime' },
        })}
      />,
    );

    expect(renderer.root.findByType('MessagePartError').props.message).toBe(
      'chat.errorPart.retryable',
    );
  });

  test('renders an interrupted turn by its protocol code', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'INTERRUPTED',
          message: 'The app restarted before this turn finished.',
          reasonCode: 'unknown',
          retryable: true,
          source: { layer: 'host', code: 'INTERRUPTED' },
        })}
      />,
    );

    const props = renderer.root.findByType('MessagePartError').props;
    expect(props.title).toBe('chat.errorPart.interrupted.title');
    expect(props.message).toBe('chat.errorPart.interrupted.message');
    expect(props.onPress).toBeUndefined();
  });

  test('opens a detail sheet with the diagnostic message and failure facts on request', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: '{"error":{"message":"Insufficient credits","request_id":"req-1"}}',
          reasonCode: 'quota',
          retryable: false,
          source: { layer: 'provider', name: 'AI_APICallError', code: 'insufficient_credit' },
          context: {
            statusCode: 403,
            providerId: 'cherryin',
            modelId: 'gpt-test',
            responseBody: '{"error":"insufficient_credit"}',
          },
        })}
      />,
    );

    expect(renderer.root.findAllByType('MessagePartDetail')).toHaveLength(0);
    const errorProps = renderer.root.findByType('MessagePartError').props;
    expect(errorProps.accessibilityHint).toBe('chat.errorPart.detail.hint');
    act(() => errorProps.onPress());

    const detail = renderer.root.findByType('MessagePartDetail');
    expect(detail.props.title).toBe('chat.errorPart.detail.title');
    const textSections = detail.findAllByType('MessagePartTextSection');
    expect(textSections.map((section) => [section.props.title, section.props.value])).toEqual([
      [
        'chat.errorPart.detail.message',
        '{"error":{"message":"Insufficient credits","request_id":"req-1"}}',
      ],
      ['chat.errorPart.detail.responseBody', '{"error":"insufficient_credit"}'],
    ]);
    expect(detail.findByType('MessagePartValueSection').props.value).toEqual({
      'chat.errorPart.detail.reason': 'quota',
      'chat.errorPart.detail.source': 'provider \u00B7 insufficient_credit',
      'chat.errorPart.detail.name': 'AI_APICallError',
      'chat.errorPart.detail.status': 403,
      'chat.errorPart.detail.provider': 'cherryin',
      'chat.errorPart.detail.model': 'gpt-test',
    });

    act(() => detail.props.onClose());
    expect(renderer.root.findAllByType('MessagePartDetail')).toHaveLength(0);
  });

  test('opens feedback or diagnosis for the failed message only when the host supports it', () => {
    const failure = errorPart({
      code: 'EXECUTION_FAILED',
      message: 'timeout',
      reasonCode: 'timeout',
      retryable: true,
    });
    const onReport = jest.fn();
    const renderer = render(
      <MessageFailureReportProvider onReport={onReport}>
        <ErrorPart messageId="message-1" part={failure} />
      </MessageFailureReportProvider>,
    );
    act(() => renderer.root.findByType('MessagePartError').props.onPress());
    const detail = renderer.root.findByType('MessagePartDetail');
    const action = detail.props.headerAction;
    expect(action.props.testID).toBe('error-part-detail-report');
    act(() => action.props.onPress());
    expect(onReport).toHaveBeenLastCalledWith('message-1', undefined);
    const diagnosis = detail.props.footer;
    expect(diagnosis.props.testID).toBe('error-part-detail-diagnose');
    act(() => diagnosis.props.onPress());
    expect(onReport).toHaveBeenLastCalledWith('message-1', 'diagnosis');

    const standalone = render(<ErrorPart messageId="message-1" part={failure} />);
    act(() => standalone.root.findByType('MessagePartError').props.onPress());
    expect(standalone.root.findByType('MessagePartDetail').props.headerAction).toBeUndefined();
    expect(standalone.root.findByType('MessagePartDetail').props.footer).toBeUndefined();
  });

  test('never uses raw names or codes as the title', () => {
    const renderer = render(
      <ErrorPart
        part={errorPart({
          code: 'EXECUTION_FAILED',
          message: 'boom',
          name: 'TypeError',
          retryable: false,
        })}
      />,
    );

    const props = renderer.root.findByType('MessagePartError').props;
    expect(props.title).toBe('chat.errorPart.title');
    expect(props.message).toBe('chat.errorPart.message');
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer as ReactTestRenderer;
}
