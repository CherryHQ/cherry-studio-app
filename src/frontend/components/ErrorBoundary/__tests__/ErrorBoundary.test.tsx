import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { ErrorBoundary } from '../ErrorBoundary';

let shouldThrow = true;
let resetFallback: (() => void) | undefined;

function Content({ label }: { label: string }) {
  if (shouldThrow) throw new Error('render failed');
  return <Text>{label}</Text>;
}

function renderFallback(reset: () => void) {
  resetFallback = reset;
  return <Text>fallback</Text>;
}

function texts(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children);
}

function renderBoundary(resetKeys?: readonly unknown[], label = 'content') {
  return (
    <ErrorBoundary fallback={renderFallback} operation="test.render" resetKeys={resetKeys}>
      <Content label={label} />
    </ErrorBoundary>
  );
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
  shouldThrow = true;
  resetFallback = undefined;
  // React logs every caught render error; the boundary's own report is asserted instead.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  test('renders the fallback in place of a throwing subtree and reports the failure', async () => {
    const reporter = jest.fn();
    const removeReporter = loggerService.setErrorReporter(reporter);
    let renderer: ReactTestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(renderBoundary());
      });
    } finally {
      removeReporter();
    }

    expect(texts(renderer!)).toEqual(['fallback']);
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failed' }), {
      module: 'ErrorBoundary',
      operation: 'test.render',
    });
  });

  test('reset renders the children again', async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(renderBoundary());
    });

    shouldThrow = false;
    await act(async () => resetFallback?.());

    expect(texts(renderer!)).toEqual(['content']);
  });

  test('stays on the fallback for unchanged reset keys and retries when one changes', async () => {
    const message = { id: 'm1' };
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(renderBoundary([message]));
    });

    shouldThrow = false;
    // A fresh array with the same values is not new data.
    await act(async () => renderer!.update(renderBoundary([message], 'same data')));
    expect(texts(renderer!)).toEqual(['fallback']);

    await act(async () => renderer!.update(renderBoundary([{ id: 'm1' }], 'new data')));
    expect(texts(renderer!)).toEqual(['new data']);
  });
});
