import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { ErrorPart } from '../ErrorPart';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
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
    const textSections = renderer.root.findAllByType('MessagePartTextSection');
    expect(textSections.map((section) => [section.props.title, section.props.value])).toEqual([
      [
        'chat.errorPart.detail.message',
        '{"error":{"message":"Insufficient credits","request_id":"req-1"}}',
      ],
      ['chat.errorPart.detail.responseBody', '{"error":"insufficient_credit"}'],
    ]);
    expect(renderer.root.findByType('MessagePartValueSection').props.value).toEqual({
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
