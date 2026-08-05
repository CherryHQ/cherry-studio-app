import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AppAlertProvider, useAppAlert } from '../AppAlertProvider';

jest.mock('@cherrystudio/ui/components', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Alert: (props: object) => React.createElement(View, { ...props, mockComponent: 'app-alert' }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type AlertApi = ReturnType<typeof useAppAlert>;

let alertApi: AlertApi | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const api = useAppAlert();

  useEffect(() => {
    alertApi = api;
  }, [api]);

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppAlertProvider', () => {
  beforeEach(async () => {
    alertApi = undefined;
    await act(async () => {
      renderer = create(
        <AppAlertProvider>
          <Probe />
        </AppAlertProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('closes a confirmation without awaiting its action', async () => {
    const confirmation = deferred<void>();

    act(() => {
      alertApi?.showConfirmation({
        confirmLabel: 'Delete',
        onConfirm: () => confirmation.promise,
        role: 'destructive',
        title: 'Delete item?',
      });
    });
    await flushEffects();

    let alert = renderer!.root.findByProps({ mockComponent: 'app-alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.actions.map((action: { label: string }) => action.label)).toEqual([
      'common.cancel',
      'Delete',
    ]);

    act(() => {
      alert.props.actions[1].onPress();
      alert.props.onOpenChange(false);
    });
    await flushEffects();

    alert = renderer!.root.findByProps({ mockComponent: 'app-alert' });
    expect(alert.props.isOpen).toBe(false);
    confirmation.resolve();
    await confirmation.promise;
  });

  it('presents queued messages in order after a closed confirmation', async () => {
    act(() => {
      alertApi?.showConfirmation({
        confirmLabel: 'Delete',
        onConfirm: () => {
          alertApi?.showMessage({ title: 'Delete failed' });
        },
        title: 'Delete item?',
      });
    });
    await flushEffects();

    let alert = renderer!.root.findByProps({ mockComponent: 'app-alert' });
    act(() => {
      alert.props.actions[1].onPress();
      alert.props.onOpenChange(false);
    });
    await flushEffects();
    await flushEffects();

    alert = renderer!.root.findByProps({ mockComponent: 'app-alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.title).toBe('Delete failed');
    expect(alert.props.actions[0].label).toBe('common.ok');
  });

  it('keeps showing messages after the requesting consumer unmounts', async () => {
    const persistentApi = alertApi;

    await act(async () => {
      renderer?.update(<AppAlertProvider />);
    });
    act(() => {
      persistentApi?.showMessage({ title: 'Background failure' });
    });
    await flushEffects();

    const alert = renderer!.root.findByProps({ mockComponent: 'app-alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.title).toBe('Background failure');
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
