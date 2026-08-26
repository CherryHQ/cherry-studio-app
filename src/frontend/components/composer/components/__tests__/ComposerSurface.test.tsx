import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ComposerProvider,
  useComposerActions,
  useComposerState,
} from '../../context/ComposerProvider';
import type {
  ComposerAttachmentDraft,
  ComposerAttachmentReady,
} from '../../utils/composerAttachments';
import { ComposerAttachments } from '../ComposerAttachments';
import { ComposerSurface } from '../ComposerSurface';

type MockComposerProps = {
  canSend?: boolean;
  children?: ReactNode;
  onSend: () => Promise<void> | void;
  value: string;
};

const mockToastShow = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
let mockComposerProps: MockComposerProps | undefined;
let mockComposerActions: ReturnType<typeof useComposerActions> | undefined;
let mockComposerState: ReturnType<typeof useComposerState> | undefined;

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  function MockComposer(props: MockComposerProps) {
    mockComposerProps = props;
    return React.createElement(View, { testID: 'mock-composer' }, props.children);
  }

  function MockCollapsible({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(View, { ...props, testID: 'mock-collapsible' }, children);
  }

  return {
    Composer: Object.assign(MockComposer, { Collapsible: MockCollapsible }),
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

jest.mock('@/frontend/components/FileEntryPreview', () => ({ FileEntryPreview: () => null }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      debug: (...args: unknown[]) => mockLoggerDebug(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
    }),
  },
}));

describe('ComposerSurface', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockComposerProps = undefined;
    mockComposerActions = undefined;
    mockComposerState = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('accepts only one send while the current send promise is unsettled', async () => {
    const pending = deferred<void>();
    const onSend = jest.fn(() => pending.promise);
    render(<ComposerSurface onSend={onSend} onStop={jest.fn()} streaming={false} />, 'hello');

    let firstSend: Promise<void> | undefined;
    let secondSend: Promise<void> | undefined;
    act(() => {
      firstSend = Promise.resolve(mockComposerProps?.onSend());
      secondSend = Promise.resolve(mockComposerProps?.onSend());
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockLoggerDebug).toHaveBeenCalledWith('Message send started', { attemptId: 1 });
    expect(mockLoggerDebug).toHaveBeenCalledWith('Ignored duplicate message send', {
      attemptId: 1,
    });

    await act(async () => {
      pending.resolve();
      await Promise.all([firstSend, secondSend]);
    });
  });

  it('allows another send after the current attempt settles', async () => {
    const onSend = jest.fn(async () => undefined);
    render(
      <ComposerSurface onSend={onSend} onStop={jest.fn()} streaming={false}>
        <StateProbe />
      </ComposerSurface>,
      'first',
    );

    await act(async () => mockComposerProps?.onSend());
    act(() => mockComposerActions?.setDraft('second'));
    await act(async () => mockComposerProps?.onSend());

    expect(onSend).toHaveBeenNthCalledWith(1, { attachments: [], text: 'first' });
    expect(onSend).toHaveBeenNthCalledWith(2, { attachments: [], text: 'second' });
    expect(mockLoggerDebug).toHaveBeenCalledWith('Message send started', { attemptId: 2 });
  });

  it('restores the exact draft and attachments once when sending fails', async () => {
    const attachment = readyAttachment();
    const onSend = jest.fn(async () => {
      throw new Error('request was not accepted');
    });
    render(
      <ComposerSurface onSend={onSend} onStop={jest.fn()} streaming={false}>
        <StateProbe />
      </ComposerSurface>,
      '  hello  ',
      [attachment],
    );

    await act(async () => mockComposerProps?.onSend());

    expect(onSend).toHaveBeenCalledWith({ attachments: [attachment], text: 'hello' });
    expect(mockComposerState).toEqual({ attachments: [attachment], draft: '  hello  ' });
    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.sendFailed',
      variant: 'danger',
    });
  });

  it('unmounts the attachment row after a successful send clears it', async () => {
    const attachment = readyAttachment();
    const onSend = jest.fn(async () => undefined);
    render(
      <ComposerSurface onSend={onSend} onStop={jest.fn()} streaming={false}>
        <ComposerAttachments />
        <StateProbe />
      </ComposerSurface>,
      '',
      [attachment],
    );

    expect(renderer?.root.findAllByProps({ testID: 'mock-collapsible' }).length).toBeGreaterThan(0);

    await act(async () => mockComposerProps?.onSend());

    expect(onSend).toHaveBeenCalledWith({ attachments: [attachment], text: '' });
    expect(mockComposerState?.attachments).toEqual([]);
    expect(renderer?.root.findAllByProps({ testID: 'mock-collapsible' })).toHaveLength(0);
  });

  it('shows attachment progress and blocks sending until the attachment is ready', () => {
    const importingAttachment: ComposerAttachmentDraft = {
      id: 'file:uploading',
      kind: 'file',
      mediaType: 'application/pdf',
      name: 'uploading.pdf',
      status: 'importing',
      uri: 'file:///source/uploading.pdf',
    };
    render(
      <ComposerSurface onSend={jest.fn(async () => undefined)} onStop={jest.fn()} streaming={false}>
        <ComposerAttachments />
        <StateProbe />
      </ComposerSurface>,
      'send later',
      [importingAttachment],
    );

    expect(renderer?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(
      renderer?.root.findAllByType(Text).some((node) => node.props.children === 'uploading.pdf'),
    ).toBe(true);
    expect(mockComposerProps?.canSend).toBe(false);

    act(() => {
      mockComposerActions?.setAttachments([
        readyAttachment({
          id: importingAttachment.id,
          name: importingAttachment.name,
        }),
      ]);
    });

    expect(renderer?.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(mockComposerProps?.canSend).toBe(true);
  });

  it('fails closed if an unready attachment reaches the imperative send boundary', async () => {
    const onSend = jest.fn(async () => undefined);
    const importingAttachment: ComposerAttachmentDraft = {
      id: 'file:uploading',
      kind: 'file',
      mediaType: 'application/pdf',
      name: 'uploading.pdf',
      status: 'importing',
      uri: 'file:///source/uploading.pdf',
    };
    render(<ComposerSurface onSend={onSend} onStop={jest.fn()} streaming={false} />, 'send later', [
      importingAttachment,
    ]);

    await act(async () => mockComposerProps?.onSend());

    expect(onSend).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.sendFailed',
      variant: 'danger',
    });
  });

  function render(
    children: ReactNode,
    initialDraft = '',
    initialAttachments: readonly ComposerAttachmentDraft[] = [],
  ) {
    act(() => {
      renderer = create(
        <ComposerProvider initialAttachments={initialAttachments} initialDraft={initialDraft}>
          {children}
        </ComposerProvider>,
      );
    });
  }
});

function StateProbe() {
  const composerActions = useComposerActions();
  const composerState = useComposerState();

  useEffect(() => {
    mockComposerActions = composerActions;
    mockComposerState = composerState;
  }, [composerActions, composerState]);

  return null;
}

function readyAttachment(
  overrides: Partial<ComposerAttachmentReady> = {},
): ComposerAttachmentReady {
  return {
    fileEntryId: '00000000-0000-7000-8000-000000000001',
    id: 'file:ready',
    kind: 'file',
    mediaType: 'application/pdf',
    name: 'ready.pdf',
    status: 'ready',
    uri: 'file:///managed/ready.pdf',
    ...overrides,
  };
}

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
