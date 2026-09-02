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
      Error: (props: object) => createElement('MessagePartError', props),
    },
  };
});

type ErrorPartInput = Extract<CherryMessagePart, { type: 'data-error' }>;

function errorPart(data: ErrorPartInput['data']): ErrorPartInput {
  return { type: 'data-error', data } as ErrorPartInput;
}

describe('ErrorPart', () => {
  test('renders provider text verbatim as the detail line', () => {
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
    expect(props.message).toBe('Incorrect API key provided: sk-***');
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
